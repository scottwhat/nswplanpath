import { formatLotLabel, parseLotIdString, titleCaseAddress } from '@planpath/shared'
import { useQuery } from '@tanstack/react-query'
import { fetchAddressesInLot } from './addresses'
import { fetchLotById } from './lots'
import { useAddress, useClickedLotId } from '../stores/useSiteStore'

/**
 * The address of a lot clicked on the map. Only an unambiguous address names
 * the lot: a corner lot or a dual occupancy can carry several, and picking one
 * would name the site wrongly — the lot label stands on its own instead.
 */
export function useLotAddress(lotId: string | null) {
  return useQuery({
    queryKey: ['lot-address', lotId],
    queryFn: async ({ signal }) => {
      const lot = await fetchLotById(lotId as string, signal)
      if (!lot) return null
      const addresses = await fetchAddressesInLot(lot.geometry, signal)
      if (addresses.length === 1) return addresses[0]
      // A strata lot lists every unit ("3/296 …") plus the building's street
      // address; that one, if it is unique, names the whole lot.
      const street = addresses.filter((candidate) => !candidate.address.includes('/'))
      return street.length === 1 ? street[0] : null
    },
    enabled: Boolean(lotId),
    staleTime: 24 * 60 * 60 * 1000,
  })
}

/**
 * What the user has actually selected, in one place, so the site header, the
 * chat panel and (later) the report all name the same site the same way.
 *
 * A clicked lot's label is derived from its DCDB lotidstring rather than read
 * out of the map's query cache — the store holds what the user did, and the
 * label is a pure function of it.
 */
export interface SelectedSite {
  /** Title-cased address: the one the user picked, or the clicked lot's own. */
  addressLabel: string | null
  /** "Lot 127 DP1971" for a lot the user clicked, if any. */
  lotLabel: string | null
  /** The line to lead with. */
  primary: string | null
  /** The supporting line, when both an address and a lot are known. */
  secondary: string | null
  hasSelection: boolean
}

export function useSelectedSite(): SelectedSite {
  const address = useAddress()
  const clickedLotId = useClickedLotId()
  const lotAddress = useLotAddress(clickedLotId)

  const siteAddress = address ?? (clickedLotId ? lotAddress.data : null) ?? null
  const addressLabel = siteAddress ? titleCaseAddress(siteAddress.address) : null
  const parsed = clickedLotId ? parseLotIdString(clickedLotId) : null
  const lotLabel = parsed ? formatLotLabel(parsed) : (clickedLotId ?? null)

  // A clicked lot is a deliberate override of the address lot, so it leads.
  const primary = lotLabel ?? addressLabel
  const secondary = lotLabel && addressLabel ? addressLabel : null

  return {
    addressLabel,
    lotLabel,
    primary,
    secondary,
    hasSelection: primary !== null,
  }
}
