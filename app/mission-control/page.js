import MissionControlClient from './MissionControlClient'

export const metadata = {
  title: 'Mission Control Sandbox | Farrington Command Center',
  description: 'Read-only cockpit experiment for Farrington Command Center.',
}

export default function MissionControlPage() {
  return <MissionControlClient />
}
