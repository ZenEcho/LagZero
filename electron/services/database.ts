import DatabaseConstructor from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { app } from 'electron'
import path from 'path'
import fs from 'fs-extra'
import { Database } from '../db/schema'
import { generateId } from '../utils/id'
import { isIconUrl, normalizeNodeType, parseStringArray, safeJsonParse } from '../utils/format'

/**
 * 数据库服务类
 * 
 * 负责 SQLite 数据库的连接、初始化、迁移以及所有核心数据的 CRUD 操作。
 * 使用 better-sqlite3 作为驱动，Kysely 作为查询构建器。
 */
export class DatabaseService {
  private db: Kysely<Database>
  private sqlite: DatabaseConstructor.Database
  /** 缓存 "Other/其他" 分类的 ID，避免频繁查询 */
  private otherCategoryId: string | null | undefined

  constructor() {
    const userDataPath = app.getPath('userData')
    const dbPath = path.join(userDataPath, 'lagzero.db')

    fs.ensureDirSync(userDataPath)

    this.sqlite = new DatabaseConstructor(dbPath)
    this.db = new Kysely<Database>({
      dialect: new SqliteDialect({
        database: this.sqlite
      })
    })

    this.initSchema()
  }

  /**
   * 解析并获取默认的 "Other" 分类 ID
   * 
   * 如果数据库中不存在，会自动创建一个名为 "Other" 的分类。
   */
  private async resolveOtherCategoryId() {
    if (this.otherCategoryId !== undefined) return this.otherCategoryId

    const byName = await this.db
      .selectFrom('categories')
      .select(['id'])
      .where('name', 'in', ['Other', 'OTHER', 'other', '未分类', '其它', '其他'])
      .executeTakeFirst()

    if (byName?.id) {
      this.otherCategoryId = byName.id
      return this.otherCategoryId
    }

    const byOrder = await this.db
      .selectFrom('categories')
      .select(['id'])
      .orderBy('order_index', 'desc')
      .executeTakeFirst()

    if (byOrder?.id) {
      this.otherCategoryId = byOrder.id
      return this.otherCategoryId
    }

    const id = generateId()
    const now = new Date().toISOString()
    await this.db
      .insertInto('categories')
      .values({
        id,
        name: 'Other',
        parent_id: null,
        rules: null,
        icon: null,
        order_index: 99,
        updated_at: now
      })
      .execute()

    this.otherCategoryId = id
    return this.otherCategoryId
  }

  /**
   * 初始化数据库 Schema
   * 
   * 创建所需的表结构 (nodes, profiles, categories, games) 并执行必要的字段迁移。
   * 同时初始化默认的分类和游戏数据。
   */
  private initSchema() {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        tag TEXT NOT NULL,
        server TEXT NOT NULL,
        server_port INTEGER NOT NULL,
        uuid TEXT,
        password TEXT,
        method TEXT,
        plugin TEXT,
        plugin_opts TEXT,
        network TEXT,
        security TEXT,
        path TEXT,
        host TEXT,
        service_name TEXT,
        alpn TEXT,
        fingerprint TEXT,
        tls TEXT,
        flow TEXT,
        packet_encoding TEXT,
        username TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        rules TEXT NOT NULL,
        chain_proxy INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id TEXT,
        rules TEXT,
        icon TEXT,
        order_index INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT,
        process_name TEXT NOT NULL,
        category_id TEXT NOT NULL,
        tags TEXT,
        profile_id TEXT,
        last_played INTEGER,
        status TEXT,
        latency INTEGER,
        node_id TEXT,
        proxy_mode TEXT,
        routing_rules TEXT,
        chain_proxy INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // Lightweight migration for existing user DBs.
    this.ensureColumn('nodes', 'plugin', 'TEXT')
    this.ensureColumn('nodes', 'plugin_opts', 'TEXT')
    this.ensureColumn('nodes', 'service_name', 'TEXT')
    this.ensureColumn('nodes', 'alpn', 'TEXT')
    this.ensureColumn('nodes', 'fingerprint', 'TEXT')
    this.ensureColumn('nodes', 'username', 'TEXT')

    this.initDefaultData()
  }

  /**
   * 确保表字段存在（轻量级迁移）
   */
  private ensureColumn(table: string, column: string, definition: string) {
    try {
      const cols = this.sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
      if (!cols.some(c => c.name === column)) {
        this.sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
      }
    } catch (e) {
      console.error(`Failed to ensure column ${table}.${column}:`, e)
    }
  }

  /**
   * 初始化默认数据
   * 
   * 如果分类表为空，插入默认的游戏分类（FPS, MOBA 等）。
   * 如果游戏表为空，插入默认的全局模式游戏项。
   */
  private async initDefaultData() {
    try {
      const result = this.sqlite.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number }
      const otherCategoryId = await this.resolveOtherCategoryId()

      if (result && result.count === 0) {
        console.log('正在初始化默认分类...')
        const defaultCategories = [
          { name: 'FPS', order: 1 },
          { name: 'MOBA', order: 2 },
          { name: 'RPG', order: 3 },
          { name: 'Racing', order: 4 },
          { name: 'Sports', order: 5 },
          { name: 'Strategy', order: 6 },
          { name: 'Survival', order: 7 },
          // 'Other' is handled by resolveOtherCategoryId
        ]

        const insert = this.sqlite.prepare('INSERT INTO categories (id, name, order_index) VALUES (@id, @name, @order)')
        const insertMany = this.sqlite.transaction((categories: typeof defaultCategories) => {
          for (const cat of categories) {
            insert.run({
              id: generateId(),
              name: cat.name,
              order: cat.order
            })
          }
        })

        insertMany(defaultCategories)
        console.log('默认分类初始化完成。')
      }

      // Init default games (Bypass Mainland China & Global Mode)
      const gamesCount = this.sqlite.prepare('SELECT COUNT(*) as count FROM games').get() as { count: number }
      if (gamesCount && gamesCount.count === 0) {
        console.log('正在初始化默认模式...')
        const defaultGames = [
          {
            id: generateId(),
            name: '加速海外游戏',
            process_name: '[]',
            category_id: otherCategoryId,
            proxy_mode: 'routing',
            routing_rules: JSON.stringify(['bypass_cn']),
            status: 'idle',
            latency: 0
          },
          {
            id: generateId(),
            name: '加速全部游戏',
            process_name: '[]',
            category_id: otherCategoryId,
            proxy_mode: 'routing',
            routing_rules: JSON.stringify([]),
            status: 'idle',
            latency: 0
          }
        ]

        const insertGame = this.sqlite.prepare(`
              INSERT INTO games (id, name, process_name, category_id, proxy_mode, routing_rules, status, latency, created_at, updated_at)
              VALUES (@id, @name, @process_name, @category_id, @proxy_mode, @routing_rules, @status, @latency, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `)

        const insertManyGames = this.sqlite.transaction((games: typeof defaultGames) => {
          for (const game of games) {
            insertGame.run(game)
          }
        })

        insertManyGames(defaultGames)
        console.log('默认模式初始化完成。')
      }
    } catch (err) {
      console.error('初始化默认数据失败：', err)
    }
  }

  /**
   * 获取所有节点
   */
  async getAllNodes() {
    const rows = await this.db.selectFrom('nodes').selectAll().execute()
    return rows.map(row => ({
      ...row,
      type: normalizeNodeType(row.type),
      tls: safeJsonParse(row.tls || 'null', undefined)
    }))
  }

  /**
   * 保存节点（新增或更新）
   * @param node - 节点对象
   */
  async saveNode(node: any) {
    const validColumns = [
      'id', 'type', 'tag', 'server', 'server_port',
      'uuid', 'password', 'method', 'plugin', 'plugin_opts', 'network', 'security',
      'path', 'host', 'service_name', 'alpn', 'fingerprint', 'tls', 'flow', 'packet_encoding', 'username',
      'created_at', 'updated_at'
    ]

    const now = new Date().toISOString()
    const id = node.id || generateId()

    const nodeData: any = {
      id,
      updated_at: now
    }

    for (const key of validColumns) {
      if (key === 'id' || key === 'updated_at') continue
      if (key === 'tls') {
        nodeData.tls = node.tls ? (typeof node.tls === 'string' ? node.tls : JSON.stringify(node.tls)) : null
        continue
      }
      if (key in node) {
        nodeData[key] = node[key]
      }
    }
    nodeData.type = normalizeNodeType(nodeData.type)

    if (!node.created_at && !node.id) {
      nodeData.created_at = now
    } else if (node.created_at) {
      nodeData.created_at = node.created_at
    }

    try {
      await this.db.insertInto('nodes')
        .values(nodeData)
        .onConflict(oc => oc.column('id').doUpdateSet(nodeData))
        .execute()
    } catch (e) {
      console.error('保存节点失败：', e)
      throw e
    }

    return this.getAllNodes()
  }

  /**
   * 删除节点
   * @param id - 节点 ID
   */
  async deleteNode(id: string) {
    await this.db.deleteFrom('nodes').where('id', '=', id).execute()
    return this.getAllNodes()
  }

  /**
   * 批量导入节点
   * @param nodes - 节点数组
   */
  async importNodes(nodes: any[]) {
    if (nodes.length === 0) return this.getAllNodes()

    const values = nodes.map(node => ({
      ...node,
      id: node.id || generateId(),
      type: normalizeNodeType(node.type),
      tls: node.tls ? JSON.stringify(node.tls) : null,
      updated_at: new Date().toISOString()
    }))

    await this.db.transaction().execute(async (trx) => {
      await trx.insertInto('nodes').values(values).execute()
    })

    return this.getAllNodes()
  }

  /**
   * 获取所有游戏
   * 
   * 包含数据格式化：解析 JSON 字段、处理图标 URL 等。
   */
  async getAllGames() {
    const rows = await this.db.selectFrom('games').selectAll().execute()
    const otherCategoryId = await this.resolveOtherCategoryId()
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      iconUrl: row.icon && isIconUrl(row.icon) ? row.icon : undefined,
      processName: parseStringArray(row.process_name),
      category: row.category_id === 'other' ? (otherCategoryId || row.category_id) : row.category_id,
      tags: safeJsonParse(row.tags || 'null', undefined),
      profileId: row.profile_id || undefined,
      lastPlayed: row.last_played || undefined,
      status: row.status || undefined,
      latency: row.latency || undefined,
      nodeId: row.node_id || undefined,
      proxyMode: (row.proxy_mode || 'process') as any,
      routingRules: row.routing_rules ? parseStringArray(row.routing_rules) : undefined,
      chainProxy: Boolean(row.chain_proxy)
    }))
  }

  /**
   * 保存游戏配置
   * 
   * 自动处理 "Other" 分类归属，并序列化 JSON 字段。
   */
  async saveGame(game: any) {
    const otherCategoryId = await this.resolveOtherCategoryId()
    const iconValue = game.iconUrl || game.icon || ''
    const icon = typeof iconValue === 'string' && iconValue.trim() && isIconUrl(iconValue) ? iconValue.trim() : null
    const categoryId =
      game.category && game.category !== 'other'
        ? game.category
        : (otherCategoryId || 'other')
    const gameData = {
      id: game.id || generateId(),
      name: game.name,
      icon,
      process_name: JSON.stringify(Array.isArray(game.processName) ? game.processName : [game.processName]),
      category_id: categoryId,
      tags: game.tags ? JSON.stringify(game.tags) : null,
      profile_id: game.profileId || null,
      last_played: game.lastPlayed || 0,
      status: game.status || 'idle',
      latency: game.latency || 0,
      node_id: game.nodeId || null,
      proxy_mode: game.proxyMode || 'process',
      routing_rules: game.routingRules ? JSON.stringify(game.routingRules) : null,
      chain_proxy: game.chainProxy ? 1 : 0,
      updated_at: new Date().toISOString()
    }

    await this.db.insertInto('games')
      .values(gameData)
      .onConflict(oc => oc.column('id').doUpdateSet(gameData))
      .execute()

    return this.getAllGames()
  }

  async deleteGame(id: string) {
    await this.db.deleteFrom('games').where('id', '=', id).execute()
    return this.getAllGames()
  }

  async getAllCategories() {
    const rows = await this.db.selectFrom('categories').selectAll().orderBy('order_index').execute()
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      parentId: row.parent_id || undefined,
      rules: safeJsonParse(row.rules || 'null', undefined),
      icon: row.icon || undefined,
      order: row.order_index
    }))
  }

  async saveCategory(category: any) {
    const data = {
      id: category.id || generateId(),
      name: category.name,
      parent_id: category.parentId || null,
      rules: category.rules ? JSON.stringify(category.rules) : null,
      icon: category.icon || null,
      order_index: category.order || 0,
      updated_at: new Date().toISOString()
    }

    await this.db.insertInto('categories')
      .values(data)
      .onConflict(oc => oc.column('id').doUpdateSet(data))
      .execute()

    return this.getAllCategories()
  }

  async deleteCategory(id: string) {
    await this.db.deleteFrom('categories').where('id', '=', id).execute()
    return this.getAllCategories()
  }

  async getAllProfiles() {
    const rows = await this.db.selectFrom('profiles').selectAll().execute()
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      rules: safeJsonParse(row.rules || '[]', []),
      chainProxy: Boolean(row.chain_proxy)
    }))
  }

  async saveProfile(profile: any) {
    const data = {
      id: profile.id || generateId(),
      name: profile.name,
      description: profile.description || null,
      rules: JSON.stringify(profile.rules || []),
      chain_proxy: profile.chainProxy ? 1 : 0,
      updated_at: new Date().toISOString()
    }

    await this.db.insertInto('profiles')
      .values(data)
      .onConflict(oc => oc.column('id').doUpdateSet(data))
      .execute()

    return this.getAllProfiles()
  }

  async deleteProfile(id: string) {
    await this.db.deleteFrom('profiles').where('id', '=', id).execute()
    return this.getAllProfiles()
  }

  /**
   * 导出所有数据
   * 
   * 用于备份或迁移，包含节点、游戏、分类、配置文件等所有信息。
   */
  async exportData() {
    const nodes = await this.getAllNodes()
    const games = await this.getAllGames()
    const categories = await this.getAllCategories()
    const profiles = await this.getAllProfiles()

    return {
      version: '1.0',
      timestamp: new Date().toISOString(),
      nodes,
      games,
      categories,
      profiles
    }
  }

  /**
   * 导入数据
   * 
   * 覆盖或新增数据，使用事务确保原子性。
   */
  async importData(data: any) {
    const otherCategoryId = await this.resolveOtherCategoryId()
    await this.db.transaction().execute(async (trx) => {
      if (data.nodes && Array.isArray(data.nodes)) {
        for (const node of data.nodes) {
          const nodeData = {
            ...node,
            id: node.id || generateId(),
            type: normalizeNodeType(node.type),
            tls: node.tls ? JSON.stringify(node.tls) : null,
            updated_at: new Date().toISOString()
          }
          await trx.insertInto('nodes').values(nodeData).onConflict(oc => oc.column('id').doUpdateSet(nodeData)).execute()
        }
      }

      if (data.categories) {
        for (const cat of data.categories) {
          const catData = {
            id: cat.id || generateId(),
            name: cat.name,
            parent_id: cat.parentId || null,
            rules: cat.rules ? JSON.stringify(cat.rules) : null,
            icon: cat.icon || null,
            order_index: cat.order || 0,
            updated_at: new Date().toISOString()
          }
          await trx.insertInto('categories').values(catData).onConflict(oc => oc.column('id').doUpdateSet(catData)).execute()
        }
      }

      if (data.games) {
        for (const game of data.games) {
          const categoryId =
            game.category && game.category !== 'other'
              ? game.category
              : (otherCategoryId || 'other')
          const gameData = {
            id: game.id || generateId(),
            name: game.name,
            icon: game.iconUrl || game.icon || null,
            process_name: JSON.stringify(Array.isArray(game.processName) ? game.processName : [game.processName]),
            category_id: categoryId,
            tags: game.tags ? JSON.stringify(game.tags) : null,
            profile_id: game.profileId || null,
            last_played: game.lastPlayed || 0,
            status: game.status || 'idle',
            latency: game.latency || 0,
            node_id: game.nodeId || null,
            proxy_mode: game.proxyMode || 'process',
            routing_rules: game.routingRules ? JSON.stringify(game.routingRules) : null,
            chain_proxy: game.chainProxy ? 1 : 0,
            updated_at: new Date().toISOString()
          }
          await trx.insertInto('games').values(gameData).onConflict(oc => oc.column('id').doUpdateSet(gameData)).execute()
        }
      }

      if (data.profiles) {
        for (const profile of data.profiles) {
          const pData = {
            id: profile.id || generateId(),
            name: profile.name,
            description: profile.description || null,
            rules: JSON.stringify(profile.rules || []),
            chain_proxy: profile.chainProxy ? 1 : 0,
            updated_at: new Date().toISOString()
          }
          await trx.insertInto('profiles').values(pData).onConflict(oc => oc.column('id').doUpdateSet(pData)).execute()
        }
      }
    })

    return true
  }
}
