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
        console.error(`[Aviso] Arquivo de configuração não encontrado em: ${configPath}`);
        return null;
      }
      const data = fs.readFileSync(configPath, "utf-8");
      return JSON.parse(data) as Connection;
    } catch (error) {
      console.error(`[Erro] Falha ao carregar configuração: ${error}`);
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
          description: "Retorna a estrutura completa do banco de dados (tabelas, colunas, tipos e comentários). Use esta ferramenta SEMPRE antes de gerar ou explicar queries para garantir que os nomes de tabelas e colunas existam.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "run_read_query",
          description: "Executa consultas SQL de leitura (SELECT). Possui limite automático de 100 linhas e gera erro se detectar comandos de escrita (INSERT/UPDATE/DELETE). Use para validar dados ou responder perguntas sobre o conteúdo das tabelas.",
          inputSchema: {
            type: "object",
            properties: {
              sql: {
                type: "string",
                description: "Query SQL SELECT (ex: SELECT count(*) FROM orders)",
              },
            },
            required: ["sql"],
          },
        },
        {
          name: "inspect_table",
          description: "Obtém detalhes profundos de uma tabela: PKs, FKs, índices e constraints. Use quando precisar entender os relacionamentos ou regras de integridade para queries complexas.",
          inputSchema: {
            type: "object",
            properties: {
              tableName: {
                type: "string",
                description: "O nome exato da tabela a ser inspecionada",
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
            "Nenhuma configuração de conexão ativa encontrada. Ative uma conexão no DBBase primeiro."
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
                  "Apenas queries de leitura (SELECT ou WITH) são permitidas."
                );
              }

              const finalSql = this.applyQueryLimit(sql);
              console.error(`[Executando Query] ${finalSql}`);
              
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
                throw new McpError(ErrorCode.InvalidParams, "Nome da tabela é obrigatório.");
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
              throw new McpError(ErrorCode.MethodNotFound, `Ferramenta desconhecida: ${name}`);
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
