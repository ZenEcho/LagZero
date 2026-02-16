
import { defineStore } from 'pinia'

import { useLocalStorage } from '@vueuse/core'

export type CheckMethod = 'ping' | 'tcp' | 'http'

export const useSettingsStore = defineStore('settings', () => {
    const checkInterval = useLocalStorage('settings-check-interval', 5000)
    const checkMethod = useLocalStorage<CheckMethod>('settings-check-method', 'ping')
    const checkUrl = useLocalStorage('settings-check-url', 'http://www.gstatic.com/generate_204')

    return {
        checkInterval,
        checkMethod,
        checkUrl
    }
})
