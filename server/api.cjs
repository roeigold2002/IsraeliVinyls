const http = require('http')
const { handler } = require('../netlify/functions/api.cjs')

const PORT = 3001

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (!url.pathname.startsWith('/api')) {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
    return
  }

  const queryParams = {}
  url.searchParams.forEach((value, key) => {
    queryParams[key] = value
  })

  const event = {
    path: url.pathname,
    rawUrl: `http://localhost:${PORT}${req.url}`,
    rawQuery: url.search.replace(/^\?/, ''),
    queryStringParameters: queryParams,
    httpMethod: req.method || 'GET',
    headers: req.headers,
  }

  try {
    const result = await handler(event, {})
    const headers = { ...(result.headers || {}), 'Access-Control-Allow-Origin': '*' }
    res.writeHead(result.statusCode, headers)
    res.end(result.body)
  } catch (err) {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: String(err) }))
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`API server listening on http://localhost:${PORT}`)
})
