import type { AddressSuggestion } from '@planpath/shared'
import { create } from 'zustand'

export type OverlayId = 'zoning' | 'heritage' | 'bushfire' | 'flood'

interface SiteState {
  /**
   * The address the user picked from the suggestion list — a real NSW address
   * point, not a typed string. Still not a propertyId; that arrives with the
   * site-resolution service (build plan step 1) and then belongs in the route
   * params rather than here.
   */
  address: AddressSuggestion | null
  /** DCDB lotidstring of a lot the user clicked, overriding the address lot. */
  clickedLotId: string | null
  overlays: OverlayId[]
  overlayOpacity: number
  setAddress: (address: AddressSuggestion) => void
  clearAddress: () => void
  clickLot: (lotId: string | null) => void
  toggleOverlay: (id: OverlayId) => void
  setOverlayOpacity: (opacity: number) => void
}

export const useSiteStore = create<SiteState>((set) => ({
  address: null,
  clickedLotId: null,
  overlays: [],
  overlayOpacity: 0.6,
  setAddress: (address) => set({ address, clickedLotId: null }),
  clearAddress: () => set({ address: null, clickedLotId: null }),
  clickLot: (clickedLotId) => set({ clickedLotId }),
  toggleOverlay: (id) =>
    set((state) => ({
      overlays: state.overlays.includes(id)
        ? state.overlays.filter((overlay) => overlay !== id)
        : [...state.overlays, id],
    })),
  setOverlayOpacity: (overlayOpacity) => set({ overlayOpacity }),
}))

export const useAddress = () => useSiteStore((state) => state.address)
export const useClickedLotId = () => useSiteStore((state) => state.clickedLotId)
