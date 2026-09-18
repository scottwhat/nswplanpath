import { formatLotLabel, parseLotIdString, titleCaseAddress } from '@planpath/shared'
import { useAddress, useClickedLotId } from '../stores/useSiteStore'

/**
 * What the user has actually selected, in one place, so the site header, the
 * chat panel and (later) the report all name the same site the same way.
 *
 * A clicked lot's label is derived from its DCDB lotidstring rather than read
 * out of the map's query cache — the store holds what the user did, and the
 * label is a pure function of it.
 */
export interface SelectedSite {
  /** Title-cased address the user picked, if any. */
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

  const addressLabel = address ? titleCaseAddress(address.address) : null
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
