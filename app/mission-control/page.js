import MissionControlClient from './MissionControlClient'

export const metadata = {
  title: 'Mission Control Sandbox | OpenOcti',
  description: 'Read-only cockpit experiment for OpenOcti.',
}

export default function MissionControlPage() {
  return <MissionControlClient />
}
