import { useEffect, useState } from 'react'
import { useStore } from './stores/useStore'
import Launcher from './views/Launcher'
import Settings from './views/Settings'

/** The same renderer bundle serves both windows: hash route picks the view. */
export default function App() {
  const init = useStore((s) => s.init)
  const [route, setRoute] = useState(() => window.location.hash)

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (route.startsWith('#/settings')) return <Settings />
  return <Launcher />
}
