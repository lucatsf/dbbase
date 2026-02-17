import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { DriverFactory } from "../database/index.js";
import { Connection } from "../types.js";
import * as fs from "fs";
import * as path from "path";

class DbBaseMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "dbbase-mcp-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private async loadConfig(): Promise<Connection | null> {
    const configPath = process.env.DBBASE_MCP_CONFIG || path.join(process.cwd(), "active_connection.json");
    try {
      if (!fs.existsSync(configPath)) {
        console.error(`[Warning] Configuration file not found at: ${configPath}`);
        return null;
      }
      const data = fs.readFileSync(configPath, "utf-8");
      return JSON.parse(data) as Connection;
    } catch (error) {
      console.error(`[Error] Failed to load configuration: ${error}`);
      return null;
    }
  }

  private validateReadQuery(sql: string): boolean {
    const cleanSql = sql.trim().toUpperCase();
    // Permite apenas SELECT e WITH (Common Table Expressions)
    return cleanSql.startsWith("SELECT") || cleanSql.startsWith("WITH");
  }

  private applyQueryLimit(sql: string): string {
    const cleanSql = sql.trim();
    // Verifica se já existe um LIMIT (case-insensitive)
    if (!/\bLIMIT\s+\d+/i.test(cleanSql)) {
      // Se termina com ponto e vírgula, insere o LIMIT antes. Caso contrário, adiciona ao fim.
      const hasSemicolon = cleanSql.endsWith(";");
      const baseQuery = hasSemicolon ? cleanSql.slice(0, -1) : cleanSql;
      return `${baseQuery} LIMIT 100${hasSemicolon ? ";" : ""}`;
    }
    return sql;
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "get_schema",
          description: "Returns the complete database schema (tables, columns, types, and comments). ALWAYS use this tool before generating or explaining queries to ensure table and column names exist.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "run_read_query",
          description: "Executes SQL read queries (SELECT). Has an automatic 100-line limit and returns an error if write commands (INSERT/UPDATE/DELETE) are detected. Use to validate data or answer questions about table content.",
          inputSchema: {
            type: "object",
            properties: {
              sql: {
                type: "string",
                description: "SQL SELECT query (e.g., SELECT count(*) FROM orders)",
              },
            },
            required: ["sql"],
          },
        },
        {
          name: "inspect_table",
          description: "Gets deep details of a table: PKs, FKs, indexes, and constraints. Use when you need to understand relationships or integrity rules for complex queries.",
          inputSchema: {
            type: "object",
            properties: {
              tableName: {
                type: "string",
                description: "The exact name of the table to inspect",
              },
            },
            required: ["tableName"],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const config = await this.loadConfig();
        if (!config) {
          throw new McpError(
            ErrorCode.InternalError,
            "No active connection configuration found. Activate a connection in DBBase first."
          );
        }

        const driver = DriverFactory.create(config);

        try {
          await driver.connect();

          switch (name) {
            case "get_schema": {
              const rawSchema = await driver.getSchema();
              // Agrupar por tabela para facilitar a leitura do Copilot/Claude
              const schema: { [key: string]: any[] } = {};
              rawSchema.forEach((row: any) => {
                if (!schema[row.table_name]) schema[row.table_name] = [];
                schema[row.table_name].push({
                  column: row.column_name,
                  type: row.data_type,
                  description: row.description || ""
                });
              });

              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(schema, null, 2),
                  },
                ],
              };
            }

            case "run_read_query": {
              const sql = String(args?.sql || "");
              if (!this.validateReadQuery(sql)) {
                throw new McpError(
                  ErrorCode.InvalidParams,
                  "Only read queries (SELECT or WITH) are allowed."
                );
              }

              const finalSql = this.applyQueryLimit(sql);
              console.error(`[Executing Query] ${finalSql}`);
              
              const result = await driver.query(finalSql);
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(result.rows, null, 2),
                  },
                ],
              };
            }

            case "inspect_table": {
              const tableName = String(args?.tableName || "");
              if (!tableName) {
                throw new McpError(ErrorCode.InvalidParams, "Table name is required.");
              }

              const details = await driver.getTableDetails(tableName);
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(details, null, 2),
                  },
                ],
              };
            }

            default:
              throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
          }
        } finally {
          await driver.disconnect().catch((err) => 
            console.error(`[Erro ao desconectar] ${err.message}`)
          );
        }
      } catch (error: any) {
        const message = error instanceof McpError ? error.message : error.message;
        console.error(`[Erro na ferramenta ${name}] ${message}`);
        return {
          content: [
            {
              type: "text",
              text: `Erro: ${message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Servidor MCP DBBase iniciado com sucesso via stdio.");
  }
}

const server = new DbBaseMcpServer();
server.run().catch((error) => {
  console.error("Falha fatal ao iniciar servidor MCP:", error);
  process.exit(1);
});
