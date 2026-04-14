import axios from 'axios'

export const getStatus  = ()          => axios.get('/api/status').then(r => r.data)
export const getAdapters = ()         => axios.get('/api/adapters').then(r => r.data)
export const setAdapter = (adapter)   => axios.put('/api/adapter', { adapter }).then(r => r.data)
export const getBeacons = ()          => axios.get('/api/beacons').then(r => r.data)
export const startScan  = ()          => axios.post('/api/scan/start').then(r => r.data)
export const stopScan   = ()          => axios.post('/api/scan/stop').then(r => r.data)
export const startSpoof = (payload)   => axios.post('/api/spoof/start', payload).then(r => r.data)
export const stopSpoof  = ()          => axios.post('/api/spoof/stop').then(r => r.data)
