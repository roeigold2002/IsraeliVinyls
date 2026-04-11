export interface StoreCatalogEntry {
  id: string
  name: string
  name_he: string
  url: string
  city: string
  platform: string
  emoji: string
  color: string
  aliases?: string[]
  snapshot_names?: string[]
  store_filter_name?: string
  search_templates?: string[]
}

const DEFAULT_SEARCH_TEMPLATES = [
  '/?post_type=product&s={query}',
  '/?s={query}&post_type=product',
  '/?s={query}',
  '/search?q={query}',
]

export const STORE_CATALOG: StoreCatalogEntry[] = [
  {
    id: 'beatnik',
    name: 'Beatnik',
    name_he: 'Beatnik',
    url: 'https://www.beatnik.co.il/',
    city: 'Tel Aviv',
    platform: 'Web',
    emoji: '🎸',
    color: '#e94560',
    snapshot_names: ['Beatnik'],
    store_filter_name: 'Beatnik',
    search_templates: ['/product/?s={query}', '/shop/?s={query}', '/?post_type=product&s={query}'],
  },
  {
    id: 'giora_records',
    name: 'Giora Records',
    name_he: 'Giora Records',
    url: 'https://www.giorarecords.co.il/',
    city: 'Holon',
    platform: 'Web',
    emoji: '🎼',
    color: '#3498db',
    aliases: ['Giora'],
    snapshot_names: ['Giora', 'Giora Records'],
    store_filter_name: 'Giora',
  },
  {
    id: 'tav8',
    name: 'Tav8',
    name_he: 'Tav8',
    url: 'https://www.tav8.co.il/',
    city: 'Netanya',
    platform: 'Web',
    emoji: '🎶',
    color: '#1abc9c',
    aliases: ['TAV8', 'Tav 8'],
    snapshot_names: ['Tav8'],
    store_filter_name: 'Tav8',
    search_templates: ['/?search={query}', '/search?q={query}'],
  },
  {
    id: 'the_vinyl_room',
    name: 'The Vinyl Room',
    name_he: 'The Vinyl Room',
    url: 'https://thevinylroom.co.il/',
    city: 'Petah Tikva',
    platform: 'Web',
    emoji: '🪩',
    color: '#f0c040',
    aliases: ['Vinyl Room'],
    snapshot_names: ['The Vinyl Room'],
    store_filter_name: 'The Vinyl Room',
    search_templates: ['/?search={query}', '/search?q={query}'],
  },
  {
    id: 'rockstore_1970',
    name: 'Rock Store 1970',
    name_he: 'Rock Store 1970',
    url: 'https://rockstore1970.co.il/',
    city: 'Israel',
    platform: 'Web',
    emoji: '🤘',
    color: '#e74c3c',
    aliases: ['Rockstore 1970'],
    search_templates: ['/?search={query}', '/search?q={query}'],
  },
  {
    id: 'third_ear',
    name: 'Third Ear',
    name_he: 'Third Ear',
    url: 'https://third-ear.com/',
    city: 'Tel Aviv',
    platform: 'Web',
    emoji: '🎵',
    color: '#f39c12',
    snapshot_names: ['Third Ear'],
    store_filter_name: 'Third Ear',
  },
  {
    id: 'hod_hamahat',
    name: 'Hod Hamahat',
    name_he: 'Hod Hamahat',
    url: 'https://hodhamahat.com/',
    city: 'Israel',
    platform: 'Web',
    emoji: '🪡',
    color: '#16a085',
    aliases: ['HodhaMahat'],
  },
  {
    id: 'holit_records',
    name: 'Holit Records',
    name_he: 'Holit Records',
    url: 'https://holit-records.co.il/',
    city: 'Israel',
    platform: 'Web',
    emoji: '🧿',
    color: '#2ecc71',
  },
  {
    id: 'disc_center',
    name: 'Disc Center',
    name_he: 'Disc Center',
    url: 'https://www.disccenter.co.il/',
    city: 'Ramat Gan',
    platform: 'Web',
    emoji: '📀',
    color: '#9b59b6',
    aliases: ['Disccenter'],
    snapshot_names: ['Disc Center'],
    store_filter_name: 'Disc Center',
  },
  {
    id: 'taklit_house',
    name: 'Taklit House',
    name_he: 'Taklit House',
    url: 'https://www.taklithouse.com/',
    city: 'Jerusalem',
    platform: 'Web',
    emoji: '💿',
    color: '#27ae60',
    aliases: ['TaklitHouse'],
    snapshot_names: ['Taklit House'],
    store_filter_name: 'Taklit House',
  },
  {
    id: 'shablool',
    name: 'Shablool',
    name_he: 'Shablool',
    url: 'https://shabloolrecords.co.il/',
    city: 'Tel Aviv',
    platform: 'Web',
    emoji: '🎷',
    color: '#0abde3',
    aliases: ['Shablool Records'],
    snapshot_names: ['Shablool', 'Shablool Records'],
    store_filter_name: 'Shablool',
  },
  {
    id: 'bside_haifa',
    name: 'B-Side Haifa',
    name_he: 'B-Side Haifa',
    url: 'https://www.bsidehaifa.co.il/',
    city: 'Haifa',
    platform: 'Web',
    emoji: '🎚️',
    color: '#7f8c8d',
    aliases: ['B Side Haifa'],
  },
  {
    id: 'vinyl_stock',
    name: 'Vinyl Stock',
    name_he: 'Vinyl Stock',
    url: 'https://www.vinylstock.co.il/',
    city: 'Ashdod',
    platform: 'Web',
    emoji: '📦',
    color: '#e67e22',
    aliases: ['Vinylstock'],
    snapshot_names: ['Vinyl Stock'],
    store_filter_name: 'Vinyl Stock',
  },
  {
    id: 'vinylia_records',
    name: 'Vinylia Records',
    name_he: 'Vinylia Records',
    url: 'https://vinyliarecords.co.il/',
    city: 'Tel Aviv',
    platform: 'Web',
    emoji: '🧡',
    color: '#d35400',
    aliases: ['Vinylia'],
  },
  {
    id: 'transistore',
    name: 'Transistore',
    name_he: 'Transistore',
    url: 'https://transistore.co.il/',
    city: 'Tel Aviv',
    platform: 'Web',
    emoji: '📻',
    color: '#34495e',
  },
  {
    id: 'my_records',
    name: 'My Records',
    name_he: 'My Records',
    url: 'https://www.my-records.co.il/',
    city: 'Haifa',
    platform: 'Web',
    emoji: '📚',
    color: '#00b894',
    snapshot_names: ['My Records'],
    store_filter_name: 'My Records',
  },
  {
    id: 'rolling_dise',
    name: 'Rolling Dise',
    name_he: 'Rolling Dise',
    url: 'https://www.rollindise.com/',
    city: 'Tel Aviv',
    platform: 'Web',
    emoji: '🎯',
    color: '#6c5ce7',
    aliases: ['Rollin Dise', 'Rolling Dice', "Rollin' Dise"],
    snapshot_names: ['Rolling Dise'],
    store_filter_name: 'Rolling Dise',
  },
  {
    id: 'hasivoov',
    name: 'HaSivoov',
    name_he: 'HaSivoov',
    url: 'https://hasivoov.co.il/',
    city: 'Ramat Hasharon',
    platform: 'Web',
    emoji: '🌀',
    color: '#fd79a8',
    aliases: ['Hasivoov', 'Ha Sivoov'],
    snapshot_names: ['HaSivoov', 'Hasivoov'],
    store_filter_name: 'HaSivoov',
  },
  {
    id: 'h2shop',
    name: 'H2Shop',
    name_he: 'H2Shop',
    url: 'https://h2shop.co.il/',
    city: 'Israel',
    platform: 'Web',
    emoji: '🛒',
    color: '#2980b9',
    aliases: ['H2 Shop', 'H2Shop Records'],
    search_templates: ['/shop/?s={query}', '/?post_type=product&s={query}'],
  },
]

function normalizeStoreName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/["'`’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const STORE_BY_ID = new Map(STORE_CATALOG.map((store) => [store.id, store]))

const STORE_BY_NAME = new Map<string, StoreCatalogEntry>()
for (const store of STORE_CATALOG) {
  const labels = [
    store.name,
    store.name_he,
    ...(store.aliases || []),
    ...(store.snapshot_names || []),
  ]
  for (const label of labels) {
    const key = normalizeStoreName(label)
    if (key && !STORE_BY_NAME.has(key)) {
      STORE_BY_NAME.set(key, store)
    }
  }
}

export function getStoreById(id: string): StoreCatalogEntry | undefined {
  return STORE_BY_ID.get(id)
}

export function getStoreByName(name: string): StoreCatalogEntry | undefined {
  return STORE_BY_NAME.get(normalizeStoreName(name))
}

export function getStoreFilterNameById(id: string): string | undefined {
  const store = getStoreById(id)
  if (!store) return undefined
  return store.store_filter_name || store.snapshot_names?.[0] || store.name
}

function resolveSearchTemplate(storeUrl: string, template: string, query: string): string | null {
  const cleanQuery = String(query || '').trim()
  if (!cleanQuery) {
    return storeUrl
  }

  const encoded = encodeURIComponent(cleanQuery)
  const resolvedPath = template.includes('{query}')
    ? template.replace(/\{query\}/g, encoded)
    : template

  try {
    const target = /^https?:\/\//i.test(resolvedPath)
      ? new URL(resolvedPath)
      : new URL(resolvedPath, storeUrl)
    return target.toString()
  } catch {
    return null
  }
}

export function buildStoreSearchUrl(storeIdOrName: string, query: string): string | null {
  const store = getStoreById(storeIdOrName) || getStoreByName(storeIdOrName)
  if (!store) return null

  const templates = store.search_templates && store.search_templates.length > 0
    ? store.search_templates
    : DEFAULT_SEARCH_TEMPLATES

  for (const template of templates) {
    const candidate = resolveSearchTemplate(store.url, template, query)
    if (candidate) return candidate
  }

  if (!String(query || '').trim()) {
    return store.url
  }

  const fallback = `${store.url.replace(/\/$/, '')}/?s=${encodeURIComponent(query)}`
  return fallback
}

export const STORE_VISUAL_MAP: Record<string, { emoji: string; color: string }> = STORE_CATALOG.reduce(
  (acc, store) => {
    const visual = { emoji: store.emoji, color: store.color }
    const labels = [
      store.name,
      store.name_he,
      ...(store.aliases || []),
      ...(store.snapshot_names || []),
    ]
    for (const label of labels) {
      if (label) {
        acc[label] = visual
      }
    }
    return acc
  },
  {} as Record<string, { emoji: string; color: string }>
)