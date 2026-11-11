import { createRoot, type Root } from 'react-dom/client'

type RendererRootHotData = {
  markovRendererRoot?: Root
}

export function getOrCreateRendererRoot(
  container: HTMLElement,
  hotData?: RendererRootHotData
): Root {
  const existingRoot = hotData?.markovRendererRoot
  if (existingRoot) {
    return existingRoot
  }
  const root = createRoot(container)
  if (hotData) {
    hotData.markovRendererRoot = root
  }
  return root
}
