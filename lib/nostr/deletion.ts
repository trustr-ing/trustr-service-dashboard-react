import { NDKEvent } from '@nostr-dev-kit/ndk'
import { getNDK, getNip07Signer } from './ndk'

export async function deleteEvent(eventId: string): Promise<void> {
  const signer = await getNip07Signer()
  if (!signer) {
    throw new Error('Nostr signer not available')
  }

  const ndk = getNDK()
  ndk.signer = signer

  const deleteEvent = new NDKEvent(ndk)
  deleteEvent.kind = 5
  deleteEvent.content = 'Deleted by user'
  deleteEvent.tags = [['e', eventId]]

  await deleteEvent.sign(signer)
  await deleteEvent.publish()
}
