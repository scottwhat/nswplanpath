import { open } from 'node:fs/promises'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { PMTiles, type RangeResponse, type Source } from 'pmtiles'

/**
 * Serves `data/cadastre/tiles/*.pmtiles` as ordinary `/{z}/{x}/{y}.mvt` requests in dev.
 *
 * PMTiles is normally read straight from the browser via `addProtocol`, but that
 * is a MapLibre API — Mapbox GL JS has no equivalent, so the archive needs
 * something in front of it that speaks plain XYZ. This is that shim for local
 * dev; production points the same route at a CDN function (see
 * data/cadastre/README.md).
 *
 * Keeping the archive whole rather than unpacking ~100k .mvt files means one
 * versioned artefact to build, diff and deploy.
 */

class NodeFileSource implements Source {
  private readonly path: string

  constructor(path: string) {
    this.path = path
  }

  getKey() {
    return this.path
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const handle = await open(this.path, 'r')
    try {
      const buffer = Buffer.alloc(length)
      const { bytesRead } = await handle.read(buffer, 0, length, offset)
      return {
        data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + bytesRead),
      }
    } finally {
      await handle.close()
    }
  }
}

const TILE_ROUTE = /^\/tiles\/([a-z0-9-]+)\/(\d+)\/(\d+)\/(\d+)\.mvt$/

export function pmtilesDevServer(): Plugin {
  const archives = new Map<string, PMTiles>()

  return {
    name: 'planpath:pmtiles-dev-server',
    apply: 'serve',
    configureServer(server) {
      // Kept out of public/ so vite build doesn't copy the archive into dist.
      const root = join(server.config.root, '..', '..', 'data', 'cadastre', 'tiles')

      server.middlewares.use((req, res, next) => {
        const match = req.url && TILE_ROUTE.exec(req.url.split('?')[0])
        if (!match) return next()

        const [, name, z, x, y] = match
        void (async () => {
          try {
            let archive = archives.get(name)
            if (!archive) {
              archive = new PMTiles(new NodeFileSource(join(root, `${name}.pmtiles`)))
              archives.set(name, archive)
            }

            const tile = await archive.getZxy(Number(z), Number(x), Number(y))
            if (!tile) {
              // An empty 204 is the correct answer for "no data here" — a 404
              // makes mapbox-gl log an error for every ocean tile.
              res.statusCode = 204
              res.end()
              return
            }

            res.setHeader('content-type', 'application/vnd.mapbox-vector-tile')
            res.setHeader('cache-control', 'public, max-age=3600')
            res.end(Buffer.from(tile.data))
          } catch (error) {
            server.config.logger.error(`[pmtiles] ${name}/${z}/${x}/${y}: ${String(error)}`)
            res.statusCode = 500
            res.end()
          }
        })()
      })
    },
  }
}
