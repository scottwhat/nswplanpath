import { bboxOfPositions, type Bbox, type LotArea } from '@planpath/shared'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import Map, {
  Layer,
  Marker,
  NavigationControl,
  ScaleControl,
  Source,
  type MapMouseEvent,
  type MapRef,
} from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { env } from '../lib/env'
import { useSelectedSite } from '../lib/selectedSite'
import {
  LOT_MIN_ZOOM,
  fetchLotAtPoint,
  fetchLotsInBbox,
  quantiseBbox,
  type LotFeature,
  type LotProperties,
} from '../lib/lots'
import { useAddress, useClickedLotId, useSiteStore } from '../stores/useSiteStore'

// Sydney — the default view until an address is picked.
const INITIAL_VIEW = { longitude: 151.2093, latitude: -33.8688, zoom: 11 }

// Instrument light on a dark basemap: cyan edges, a faint cyan wash for fill.
// Instrument light over the Mapbox Standard basemap: a saturated teal that
// holds against its blues and greens, with white halos behind label text.
const BEAM = '#0e7490'
const BEAM_BRIGHT = '#06b6d4'
const PAPER = '#ffffff'

export function SiteMap() {
  const mapRef = useRef<MapRef>(null)
  const [ready, setReady] = useState(false)
  const [bbox, setBbox] = useState<Bbox | null>(null)
  const [zoom, setZoom] = useState(INITIAL_VIEW.zoom)

  const address = useAddress()
  const clickedLotId = useClickedLotId()
  const clickLot = useSiteStore((state) => state.clickLot)
  const site = useSelectedSite()

  /** The lot containing the picked address point. */
  const addressLot = useQuery({
    queryKey: ['lot-at-point', address?.gurasid],
    queryFn: ({ signal }) => fetchLotAtPoint(address!, signal),
    enabled: Boolean(address),
    staleTime: 24 * 60 * 60 * 1000,
  })

  // Fly to the address immediately, then tighten onto the lot once it lands.
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __fly: { address, ready, hasRef: Boolean(mapRef.current) } })
    if (!address || !ready) return
    mapRef.current?.flyTo({
      center: [address.longitude, address.latitude],
      zoom: 17.5,
      duration: 1800,
      essential: true,
    })
  }, [address, ready])

  useEffect(() => {
    const lot = addressLot.data
    if (!lot || !ready) return
    mapRef.current?.fitBounds(bboxOfPositions(lot.geometry.coordinates), {
      padding: 90,
      maxZoom: 19,
      duration: 900,
    })
  }, [addressLot.data, ready])

  const syncViewport = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const bounds = map.getBounds()
    if (!bounds) return
    setZoom(map.getZoom())
    setBbox(
      quantiseBbox([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]),
    )
  }, [])

  const lotsEnabled = Boolean(bbox) && zoom >= LOT_MIN_ZOOM
  const lots = useQuery({
    queryKey: ['lots', bbox],
    queryFn: ({ signal }) => fetchLotsInBbox(bbox as Bbox, signal),
    enabled: lotsEnabled,
    staleTime: 30 * 60 * 1000,
  })

  const onClick = useCallback(
    (event: MapMouseEvent) => {
      const properties = event.features?.[0]?.properties as LotProperties | undefined
      const lotId = properties?.lotIdString ?? null
      // Clicking the searched address's own lot keeps that address.
      clickLot(lotId === addressLot.data?.properties.lotIdString ? null : lotId)
    },
    [clickLot, addressLot.data],
  )

  // A clicked lot wins over the address lot; otherwise the address lot stays lit.
  const clickedLot = lots.data?.features.find(
    (feature: LotFeature) => feature.properties.lotIdString === clickedLotId,
  )
  const highlighted = clickedLot ?? addressLot.data ?? null

  return (
    <div className="panel relative h-full w-full overflow-hidden">
      <Map
        ref={mapRef}
        mapboxAccessToken={env.VITE_MAPBOX_ACCESS_TOKEN}
        initialViewState={INITIAL_VIEW}
        mapStyle="mapbox://styles/mapbox/standard"
        interactiveLayerIds={lotsEnabled ? ['lot-fill'] : []}
        onLoad={(event) => {
          setReady(true)
          syncViewport()
          if (import.meta.env.DEV) Object.assign(window, { __map: event.target, __mapRef: mapRef })
        }}
        onMoveEnd={syncViewport}
        onClick={onClick}
        cursor={lotsEnabled ? 'pointer' : 'grab'}
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <ScaleControl position="bottom-right" />

        {lots.data && (
          <Source id="lots" type="geojson" data={lots.data}>
            <Layer
              id="lot-fill"
              type="fill"
              slot="top"
              paint={{ 'fill-color': BEAM, 'fill-opacity': 0.06 }}
            />
            <Layer
              id="lot-line"
              type="line"
              slot="top"
              paint={{ 'line-color': BEAM, 'line-width': 1, 'line-opacity': 0.55 }}
            />
            <Layer
              id="lot-label"
              type="symbol"
              slot="top"
              minzoom={17}
              layout={{
                'text-field': ['get', 'label'],
                'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                'text-size': 11,
                'text-allow-overlap': false,
              }}
              paint={{
                'text-color': BEAM,
                'text-halo-color': PAPER,
                'text-halo-width': 1.6,
              }}
            />
          </Source>
        )}

        {highlighted && (
          <Source id="highlighted-lot" type="geojson" data={highlighted}>
            <Layer
              id="highlighted-lot-fill"
              type="fill"
              slot="top"
              paint={{ 'fill-color': BEAM, 'fill-opacity': 0.12 }}
            />
            {/* Two strokes: a soft bloom under a crisp core line. */}
            <Layer
              id="highlighted-lot-glow"
              type="line"
              slot="top"
              paint={{ 'line-color': BEAM_BRIGHT, 'line-width': 9, 'line-opacity': 0.25, 'line-blur': 5 }}
            />
            <Layer
              id="highlighted-lot-line"
              type="line"
              slot="top"
              paint={{ 'line-color': BEAM, 'line-width': 2 }}
            />
          </Source>
        )}

        {address && (
          <Marker longitude={address.longitude} latitude={address.latitude} anchor="center">
            {/* Address point: a lit core inside a soft halo. */}
            <span className="relative grid h-4 w-4 place-items-center">
              <span className="absolute inset-0 rounded-full bg-beam-500/30 blur-[3px]" />
              <span className="h-2 w-2 rounded-full bg-beam-700 ring-2 ring-white" />
            </span>
          </Marker>
        )}
      </Map>

      {!ready && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-navy-50">
          <span className="readout">Acquiring basemap…</span>
        </div>
      )}

      <MapStatus
        zoom={zoom}
        lotsEnabled={lotsEnabled}
        loading={lots.isFetching || addressLot.isFetching}
        error={(lots.error ?? addressLot.error) as Error | null}
        count={lots.data?.features.length ?? 0}
        highlighted={highlighted?.properties ?? null}
        addressLabel={site.addressLabel}
        addressLotMissing={Boolean(address) && addressLot.isFetched && addressLot.data === null}
      />
    </div>
  )
}

/** "plan area 623.4 m²", or "≈ 601 m² (calculated)" when measured from the polygon. */
function formatLotArea(area: LotArea): string {
  if (area.source === 'plan') return `plan area ${area.squareMetres.toLocaleString()} m²`
  return `≈ ${Math.round(area.squareMetres).toLocaleString()} m² (calculated)`
}

function MapStatus({
  zoom,
  lotsEnabled,
  loading,
  error,
  count,
  highlighted,
  addressLabel,
  addressLotMissing,
}: {
  zoom: number
  lotsEnabled: boolean
  loading: boolean
  error: Error | null
  count: number
  highlighted: LotProperties | null
  addressLabel: string | null
  addressLotMissing: boolean
}) {
  return (
    <div className="glow-beam pointer-events-none absolute top-3 left-3 max-w-sm rounded-sm border border-beam-600 border-l-4 border-l-beam-500 bg-navy-100/95 px-3 py-2 text-xs text-navy-900 shadow-md backdrop-blur-md">
      {error ? (
        <span className="text-signal-400">Cadastre unavailable: {error.message}</span>
      ) : addressLotMissing ? (
        <span className="text-signal-400">
          No lot found under {addressLabel} — the address point may sit on a road reserve or
          in a strata scheme. Click the parcel you mean.
        </span>
      ) : highlighted ? (
        <>
          <span className="font-semibold text-navy-990">{highlighted.label}</span>
          <span className="mt-0.5 block font-mono text-[11px] text-beam-800">
            {addressLabel ? `${addressLabel} · ` : ''}
            {formatLotArea(highlighted.area)}
          </span>
        </>
      ) : loading ? (
        <span className="readout">Scanning cadastre…</span>
      ) : !lotsEnabled ? (
        <span className="text-navy-700">
          Zoom to {LOT_MIN_ZOOM}+ to load lot boundaries — currently{' '}
          <span className="font-mono text-beam-800">{zoom.toFixed(1)}</span>.
        </span>
      ) : (
        <span className="text-navy-700">
          <span className="font-mono text-beam-800">{count}</span> lots in view — click one
          to select. Source: NSW DCDB.
        </span>
      )}
    </div>
  )
}
