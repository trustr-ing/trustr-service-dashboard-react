'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { nip19 } from 'nostr-tools'
import type { NDKEvent } from '@nostr-dev-kit/ndk'
import { fetchProfile, getDisplayName, type NostrProfile } from '@/lib/nostr/profiles'
import { fetchEventByRef } from '@/lib/nostr/eventFetch'

interface EventCardProps {
  rank: number
  resultTag: 'e' | 'a'
  subject: string
  score: number
  povRank?: number
  confidence?: number
}

const NOTE_PREVIEW_LEN = 280

function formatScore(score: number): string {
  return score.toFixed(6)
}

function safeNpubEncode(pubkey: string): string | null {
  try {
    return nip19.npubEncode(pubkey)
  } catch {
    return null
  }
}

function safeNeventEncode(id: string, author?: string): string | null {
  try {
    return nip19.neventEncode({ id, author })
  } catch {
    return null
  }
}

function safeNaddrEncode(kind: number, pubkey: string, identifier: string): string | null {
  try {
    return nip19.naddrEncode({ kind, pubkey, identifier })
  } catch {
    return null
  }
}

function splitACoordinate(
  subject: string,
): { kind: number; pubkey: string; identifier: string } | null {
  const parts = subject.split(':')
  if (parts.length !== 3) return null
  const kind = parseInt(parts[0], 10)
  if (!Number.isFinite(kind) || !parts[1]) return null
  return { kind, pubkey: parts[1], identifier: parts[2] ?? '' }
}

export function EventCard({ rank, resultTag, subject, score, povRank, confidence }: EventCardProps) {
  const [event, setEvent] = useState<NDKEvent | null>(null)
  const [profile, setProfile] = useState<NostrProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let mounted = true

    void (async () => {
      const fetched = await fetchEventByRef(resultTag, subject)
      if (!mounted) return
      setEvent(fetched)
      if (fetched?.pubkey) {
        const p = await fetchProfile(fetched.pubkey)
        if (mounted) setProfile(p)
      }
      if (mounted) setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [resultTag, subject])

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

  const copy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text)
    setCopiedLabel(label)
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopiedLabel(null), 1500)
  }

  const authorPubkey =
    event?.pubkey ?? (resultTag === 'a' ? splitACoordinate(subject)?.pubkey : undefined)
  const displayName = profile
    ? getDisplayName(profile)
    : authorPubkey
      ? `${authorPubkey.slice(0, 8)}…`
      : '(unknown author)'
  const avatarSrc = profile?.picture
    || (authorPubkey ? `https://api.dicebear.com/7.x/identicon/svg?seed=${authorPubkey}` : null)
  const npub = authorPubkey ? safeNpubEncode(authorPubkey) : null

  const eventId = event?.id ?? (resultTag === 'e' ? subject : undefined)
  const nevent = eventId ? safeNeventEncode(eventId, authorPubkey) : null
  const naddr = (() => {
    if (resultTag !== 'a') return null
    const parts = splitACoordinate(subject)
    if (!parts) return null
    return safeNaddrEncode(parts.kind, parts.pubkey, parts.identifier)
  })()
  const rawJson = event ? JSON.stringify(event.rawEvent(), null, 2) : null

  const isArticle = event?.kind === 30023
  const title = isArticle ? event?.tags.find(t => t[0] === 'title')?.[1] : null
  const summary = isArticle ? event?.tags.find(t => t[0] === 'summary')?.[1] : null
  const content = event?.content ?? ''
  const contentPreview =
    content.length > NOTE_PREVIEW_LEN ? `${content.slice(0, NOTE_PREVIEW_LEN)}…` : content

  const njumpUrl = nevent
    ? `https://njump.me/${nevent}`
    : naddr
      ? `https://njump.me/${naddr}`
      : null

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 text-sm font-semibold text-gray-500 w-8 text-right pt-1">
          #{rank}
        </div>

        <div className="flex-shrink-0">
          {avatarSrc ? (
            <Image
              src={avatarSrc}
              alt={displayName}
              width={40}
              height={40}
              unoptimized
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-700" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{displayName}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500 uppercase">{resultTag}</span>
            {npub && (
              <button
                type="button"
                onClick={() => copy(npub, 'npub')}
                title="Copy npub"
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline decoration-dotted"
              >
                {copiedLabel === 'npub' ? '✓ copied npub' : 'copy npub'}
              </button>
            )}
            {authorPubkey && (
              <button
                type="button"
                onClick={() => copy(authorPubkey, 'hex')}
                title="Copy hex pubkey"
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline decoration-dotted"
              >
                {copiedLabel === 'hex' ? '✓ copied hex' : 'copy hex'}
              </button>
            )}
          </div>

          <div className="mt-1 text-xs text-gray-500 flex items-center gap-3 flex-wrap">
            <span>Rank: <span className="font-mono">{formatScore(score)}</span></span>
            {povRank !== undefined && (
              <span>POV: <span className="font-mono">{formatScore(povRank)}</span></span>
            )}
            {confidence !== undefined && (
              <span>Conf: <span className="font-mono">{formatScore(confidence)}</span></span>
            )}
          </div>

          <div className="mt-2 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
            {loading ? (
              <span className="text-gray-400 italic">Loading event…</span>
            ) : event ? (
              <>
                {isArticle && title && <div className="font-semibold">{title}</div>}
                {isArticle && summary && (
                  <div className="text-gray-600 dark:text-gray-400 text-xs mt-1">{summary}</div>
                )}
                {!isArticle && <div>{contentPreview || <span className="text-gray-400 italic">(empty content)</span>}</div>}
              </>
            ) : (
              <span className="text-gray-400 italic">Event not found on relays</span>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 relative" ref={menuRef}>
          <button
            type="button"
            aria-label="More actions"
            onClick={() => setMenuOpen(v => !v)}
            className="h-8 w-8 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 text-lg leading-none"
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-9 z-10 min-w-[200px] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1 text-sm">
              {eventId && (
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => {
                    copy(eventId, 'event-id')
                    setMenuOpen(false)
                  }}
                >
                  {copiedLabel === 'event-id' ? '✓ Copied event id' : 'Copy event id (hex)'}
                </button>
              )}
              {nevent && (
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => {
                    copy(nevent, 'nevent')
                    setMenuOpen(false)
                  }}
                >
                  {copiedLabel === 'nevent' ? '✓ Copied nevent' : 'Copy nevent'}
                </button>
              )}
              {naddr && (
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => {
                    copy(naddr, 'naddr')
                    setMenuOpen(false)
                  }}
                >
                  {copiedLabel === 'naddr' ? '✓ Copied naddr' : 'Copy naddr'}
                </button>
              )}
              {rawJson && (
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => {
                    copy(rawJson, 'json')
                    setMenuOpen(false)
                  }}
                >
                  {copiedLabel === 'json' ? '✓ Copied JSON' : 'Copy raw JSON'}
                </button>
              )}
              {njumpUrl && (
                <a
                  href={njumpUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => setMenuOpen(false)}
                >
                  Open on njump.me ↗
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
