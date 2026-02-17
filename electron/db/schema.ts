import { Generated } from 'kysely'

export interface NodesTable {
  id: string
  type: string
  tag: string
  server: string
  server_port: number
  uuid: string | null
  password: string | null
  method: string | null
  plugin: string | null
  plugin_opts: string | null
  network: string | null
  security: string | null
  path: string | null
  host: string | null
  service_name: string | null
  alpn: string | null
  fingerprint: string | null
  tls: string | null // JSON
  flow: string | null
  packet_encoding: string | null
  username: string | null
  created_at: Generated<string>
  updated_at: Generated<string>
}

export interface ProfilesTable {
  id: string
  name: string
  description: string | null
  rules: string // JSON: { type, value, outbound }[]
  chain_proxy: number // boolean 0/1
  created_at: Generated<string>
  updated_at: Generated<string>
}

export interface CategoriesTable {
  id: string
  name: string
  parent_id: string | null
  rules: string | null // JSON string[]
  icon: string | null
  order_index: number
  created_at: Generated<string>
  updated_at: Generated<string>
}

export interface GamesTable {
  id: string
  name: string
  icon: string | null
  process_name: string // JSON string[] or comma separated? Let's use JSON for string[]
  category_id: string
  tags: string | null // JSON string[]
  profile_id: string | null
  last_played: number | null
  status: string | null
  latency: number | null
  node_id: string | null
  proxy_mode: string | null // 'process' | 'routing'
  routing_rules: string | null // JSON string[]
  chain_proxy: number // boolean 0/1
  created_at: Generated<string>
  updated_at: Generated<string>
}

export interface Database {
  nodes: NodesTable
  profiles: ProfilesTable
  categories: CategoriesTable
  games: GamesTable
}
