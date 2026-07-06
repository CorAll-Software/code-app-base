import { create } from 'zustand'

interface ProfileDrawerState {
    open: boolean
    openDrawer: () => void
    closeDrawer: () => void
}

export const useProfileDrawerStore = create<ProfileDrawerState>()((set) => ({
    open: false,
    openDrawer: () => set({ open: true }),
    closeDrawer: () => set({ open: false }),
}))
