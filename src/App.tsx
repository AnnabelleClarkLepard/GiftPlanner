import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { hasSupabaseConfig, supabase } from './lib/supabase'
import './App.css'

type AuthMode = 'sign-in' | 'sign-up' | 'reset' | 'update-password'
type SourceType = 'text' | 'link' | 'image'
type GiftStatus = 'idea' | 'gifted'

type Person = {
  id: string
  name: string
  created_at: string
}

type Event = {
  id: string
  name: string
  event_date: string | null
  created_at: string
}

type Gift = {
  id: string
  person_id: string
  event_id: string | null
  title: string
  notes: string | null
  source_type: SourceType
  source_url: string | null
  image_path: string | null
  price: number | null
  status: GiftStatus
  created_at: string
  updated_at: string
}

type LinkPreview = {
  title: string
  imageUrl: string
  provider: string
}

const storageBucket = 'gifts-media'

const friendlyDate = (value: string | null) => {
  if (!value) return 'No date'
  const date = new Date(`${value}T00:00:00`)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const buildPasswordResetRedirect = () => {
  if (typeof window === 'undefined') return undefined
  return `${window.location.origin}${window.location.pathname}`
}

const normalizeUrl = (value: string) => {
  if (!value.trim()) return ''
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  return `https://${value}`
}

const sanitizeFilename = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9.\-_]/g, '-').replace(/-+/g, '-')

async function fetchPreview(url: string): Promise<LinkPreview | null> {
  const normalizedUrl = normalizeUrl(url)
  if (!normalizedUrl) return null

  try {
    const request = await fetch(
      `https://noembed.com/embed?url=${encodeURIComponent(normalizedUrl)}`,
    )

    if (!request.ok) return null
    const payload = (await request.json()) as {
      title?: string
      provider_name?: string
      thumbnail_url?: string
    }

    return {
      title: payload.title ?? '',
      imageUrl: payload.thumbnail_url ?? '',
      provider: payload.provider_name ?? '',
    }
  } catch {
    return null
  }
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authError, setAuthError] = useState('')
  const [isAuthLoading, setIsAuthLoading] = useState(true)

  const [people, setPeople] = useState<Person[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [gifts, setGifts] = useState<Gift[]>([])
  const [isDataLoading, setIsDataLoading] = useState(false)
  const [dataError, setDataError] = useState('')

  const [selectedPersonId, setSelectedPersonId] = useState('')
  const [eventFilterId, setEventFilterId] = useState('all')
  const [showGifted, setShowGifted] = useState(false)

  const [newPersonName, setNewPersonName] = useState('')
  const [newEventName, setNewEventName] = useState('')
  const [newEventDate, setNewEventDate] = useState('')

  const [giftTitle, setGiftTitle] = useState('')
  const [giftNotes, setGiftNotes] = useState('')
  const [giftSourceType, setGiftSourceType] = useState<SourceType>('text')
  const [giftSourceUrl, setGiftSourceUrl] = useState('')
  const [giftEventId, setGiftEventId] = useState('')
  const [giftPersonId, setGiftPersonId] = useState('')
  const [giftPrice, setGiftPrice] = useState('')
  const [giftImageFile, setGiftImageFile] = useState<File | null>(null)
  const [giftFormBusy, setGiftFormBusy] = useState(false)
  const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null)
  const [giftImageUrls, setGiftImageUrls] = useState<Record<string, string>>({})

  const userId = session?.user.id ?? ''

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) {
      setIsAuthLoading(false)
      return
    }

    let active = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setIsAuthLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (event === 'PASSWORD_RECOVERY') {
        setAuthMode('update-password')
        setAuthMessage('Choose a new password for your account.')
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const client = supabase
    if (!session || !client) {
      setPeople([])
      setEvents([])
      setGifts([])
      setGiftImageUrls({})
      return
    }

    let active = true
    const loadData = async () => {
      setIsDataLoading(true)
      setDataError('')

      const [peopleResult, eventsResult, giftsResult] = await Promise.all([
        client.from('people').select('*').order('created_at', { ascending: true }),
        client
          .from('events')
          .select('*')
          .order('event_date', { ascending: true, nullsFirst: false }),
        client.from('gifts').select('*').order('created_at', { ascending: false }),
      ])

      if (!active) return

      if (peopleResult.error || eventsResult.error || giftsResult.error) {
        setDataError(
          peopleResult.error?.message ??
            eventsResult.error?.message ??
            giftsResult.error?.message ??
            'Failed to load data.',
        )
      } else {
        setPeople((peopleResult.data ?? []) as Person[])
        setEvents((eventsResult.data ?? []) as Event[])
        setGifts((giftsResult.data ?? []) as Gift[])
      }

      setIsDataLoading(false)
    }

    void loadData()

    return () => {
      active = false
    }
  }, [session])

  useEffect(() => {
    if (selectedPersonId && people.some((person) => person.id === selectedPersonId)) {
      return
    }

    setSelectedPersonId(people[0]?.id ?? '')
  }, [people, selectedPersonId])

  useEffect(() => {
    if (giftPersonId && people.some((person) => person.id === giftPersonId)) {
      return
    }

    setGiftPersonId(selectedPersonId || people[0]?.id || '')
  }, [giftPersonId, people, selectedPersonId])

  useEffect(() => {
    const client = supabase
    if (!client || gifts.length === 0) return

    let active = true
    const loadImageUrls = async () => {
      const imageGifts = gifts.filter(
        (gift) => gift.source_type === 'image' && gift.image_path && !giftImageUrls[gift.id],
      )
      if (!imageGifts.length) return

      const pairs = await Promise.all(
        imageGifts.map(async (gift) => {
          const { data } = await client.storage
            .from(storageBucket)
            .createSignedUrl(gift.image_path as string, 60 * 60)

          return [gift.id, data?.signedUrl ?? ''] as const
        }),
      )

      if (!active) return

      setGiftImageUrls((prev) => ({
        ...prev,
        ...Object.fromEntries(pairs.filter((pair) => pair[1])),
      }))
    }

    void loadImageUrls()

    return () => {
      active = false
    }
  }, [gifts, giftImageUrls])

  const filteredGifts = useMemo(() => {
    return gifts
      .filter((gift) => gift.person_id === selectedPersonId)
      .filter((gift) => (showGifted ? true : gift.status !== 'gifted'))
      .filter((gift) => (eventFilterId === 'all' ? true : gift.event_id === eventFilterId))
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'gifted' ? 1 : -1
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
  }, [eventFilterId, gifts, selectedPersonId, showGifted])

  const selectedPerson = people.find((person) => person.id === selectedPersonId)

  const clearGiftForm = () => {
    setGiftTitle('')
    setGiftNotes('')
    setGiftSourceUrl('')
    setGiftEventId('')
    setGiftPrice('')
    setGiftImageFile(null)
    setLinkPreview(null)
    setGiftSourceType('text')
  }

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return

    setAuthError('')
    setAuthMessage('')

    if (!authEmail.trim()) {
      setAuthError('Email is required.')
      return
    }

    if (authMode === 'sign-in' || authMode === 'sign-up') {
      if (authPassword.length < 6) {
        setAuthError('Password must be at least 6 characters.')
        return
      }
    }

    setIsAuthLoading(true)

    if (authMode === 'sign-in') {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      })

      if (error) setAuthError(error.message)
    }

    if (authMode === 'sign-up') {
      const { error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
        options: {
          emailRedirectTo: buildPasswordResetRedirect(),
        },
      })

      if (error) {
        setAuthError(error.message)
      } else {
        setAuthMessage('Account created. Check your inbox for verification if required.')
      }
    }

    if (authMode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(authEmail, {
        redirectTo: buildPasswordResetRedirect(),
      })

      if (error) {
        setAuthError(error.message)
      } else {
        setAuthMessage('Password reset email sent. Open the link and return here.')
      }
    }

    setIsAuthLoading(false)
  }

  const handleUpdatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    setAuthError('')
    setAuthMessage('')

    if (newPassword.length < 6) {
      setAuthError('Password must be at least 6 characters.')
      return
    }

    setIsAuthLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      setAuthError(error.message)
    } else {
      setAuthMode('sign-in')
      setAuthMessage('Password updated. Sign in with your new password.')
      setNewPassword('')
    }

    setIsAuthLoading(false)
  }

  const handleSignOut = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  const handleAddPerson = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase || !userId || !newPersonName.trim()) return

    const { data, error } = await supabase
      .from('people')
      .insert({ user_id: userId, name: newPersonName.trim() })
      .select()
      .single()

    if (error) {
      setDataError(error.message)
      return
    }

    const created = data as Person
    setPeople((prev) => [...prev, created])
    setSelectedPersonId(created.id)
    setGiftPersonId(created.id)
    setNewPersonName('')
  }

  const handleAddEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase || !userId || !newEventName.trim()) return

    const { data, error } = await supabase
      .from('events')
      .insert({
        user_id: userId,
        name: newEventName.trim(),
        event_date: newEventDate || null,
      })
      .select()
      .single()

    if (error) {
      setDataError(error.message)
      return
    }

    setEvents((prev) => [...prev, data as Event])
    setNewEventName('')
    setNewEventDate('')
  }

  const handleFetchPreview = async () => {
    if (giftSourceType !== 'link' || !giftSourceUrl.trim()) return

    const preview = await fetchPreview(giftSourceUrl)
    setLinkPreview(preview)

    if (preview?.title && !giftTitle.trim()) {
      setGiftTitle(preview.title)
    }
  }

  const handleAddGift = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase || !userId) return

    const normalizedSourceUrl = giftSourceType === 'link' ? normalizeUrl(giftSourceUrl) : ''

    if (!giftPersonId) {
      setDataError('Choose a person folder before saving a gift.')
      return
    }

    if (!giftTitle.trim()) {
      setDataError('Gift title is required.')
      return
    }

    if (giftSourceType === 'image' && !giftImageFile) {
      setDataError('Choose an image before saving an image gift.')
      return
    }

    setGiftFormBusy(true)
    setDataError('')

    let imagePath: string | null = null

    if (giftSourceType === 'image' && giftImageFile) {
      imagePath = `${userId}/${Date.now()}-${sanitizeFilename(giftImageFile.name)}`
      const uploadResult = await supabase.storage
        .from(storageBucket)
        .upload(imagePath, giftImageFile, {
          upsert: false,
        })

      if (uploadResult.error) {
        setGiftFormBusy(false)
        setDataError(uploadResult.error.message)
        return
      }
    }

    const parsedPrice = giftPrice.trim() ? Number(giftPrice) : null
    const safePrice = Number.isFinite(parsedPrice) ? parsedPrice : null

    const { data, error } = await supabase
      .from('gifts')
      .insert({
        user_id: userId,
        person_id: giftPersonId,
        event_id: giftEventId || null,
        title: giftTitle.trim(),
        notes: giftNotes.trim() || null,
        source_type: giftSourceType,
        source_url: normalizedSourceUrl || null,
        image_path: imagePath,
        price: safePrice,
        status: 'idea',
      })
      .select()
      .single()

    if (error) {
      if (imagePath) {
        await supabase.storage.from(storageBucket).remove([imagePath])
      }

      setGiftFormBusy(false)
      setDataError(error.message)
      return
    }

    setGifts((prev) => [data as Gift, ...prev])
    clearGiftForm()
    setGiftFormBusy(false)
  }

  const toggleGiftStatus = async (gift: Gift) => {
    if (!supabase) return
    const nextStatus: GiftStatus = gift.status === 'idea' ? 'gifted' : 'idea'

    const { error } = await supabase
      .from('gifts')
      .update({ status: nextStatus })
      .eq('id', gift.id)

    if (error) {
      setDataError(error.message)
      return
    }

    setGifts((prev) =>
      prev.map((entry) =>
        entry.id === gift.id ? { ...entry, status: nextStatus, updated_at: new Date().toISOString() } : entry,
      ),
    )
  }

  const deleteGift = async (gift: Gift) => {
    if (!supabase) return
    const confirmed = window.confirm(`Delete "${gift.title}"?`)
    if (!confirmed) return

    const { error } = await supabase.from('gifts').delete().eq('id', gift.id)
    if (error) {
      setDataError(error.message)
      return
    }

    if (gift.image_path) {
      await supabase.storage.from(storageBucket).remove([gift.image_path])
    }

    setGifts((prev) => prev.filter((entry) => entry.id !== gift.id))
    setGiftImageUrls((prev) => {
      const next = { ...prev }
      delete next[gift.id]
      return next
    })
  }

  if (!hasSupabaseConfig) {
    return (
      <main className="setup-screen">
        <div className="setup-card">
          <h1>Gift Planner Setup Needed</h1>
          <p>
            Add your Supabase environment variables in a local .env file before running the app.
          </p>
          <ol>
            <li>Copy .env.example to .env</li>
            <li>Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY</li>
            <li>Run the SQL in supabase/schema.sql</li>
            <li>Create a private storage bucket named gifts-media</li>
          </ol>
        </div>
      </main>
    )
  }

  if (isAuthLoading) {
    return (
      <main className="setup-screen">
        <p className="loading-pill">Loading your gift studio...</p>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <h1>Whimsy Gift Planner</h1>
          <p className="auth-subtitle">
            Keep gift ideas from links, notes, screenshots, and photos in one magical place.
          </p>

          {authMode === 'update-password' ? (
            <form onSubmit={handleUpdatePassword} className="auth-form">
              <label>
                New Password
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="At least 6 characters"
                />
              </label>
              <button type="submit" disabled={isAuthLoading}>
                Save New Password
              </button>
            </form>
          ) : (
            <form onSubmit={handleAuthSubmit} className="auth-form">
              <label>
                Email
                <input
                  type="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </label>

              {authMode !== 'reset' ? (
                <label>
                  Password
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    placeholder="At least 6 characters"
                  />
                </label>
              ) : null}

              <button type="submit" disabled={isAuthLoading}>
                {authMode === 'sign-in' ? 'Sign In' : null}
                {authMode === 'sign-up' ? 'Create Account' : null}
                {authMode === 'reset' ? 'Send Reset Email' : null}
              </button>
            </form>
          )}

          <div className="auth-actions">
            <button type="button" onClick={() => setAuthMode('sign-in')}>
              Sign In
            </button>
            <button type="button" onClick={() => setAuthMode('sign-up')}>
              Sign Up
            </button>
            <button type="button" onClick={() => setAuthMode('reset')}>
              Forgot Password
            </button>
          </div>

          {authMessage ? <p className="message success">{authMessage}</p> : null}
          {authError ? <p className="message error">{authError}</p> : null}
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Whimsy Gift Planner</p>
          <h1>Gift Ideas Studio</h1>
        </div>
        <button type="button" className="ghost" onClick={handleSignOut}>
          Sign out
        </button>
      </header>

      <section className="content-grid">
        <aside className="sidebar">
          <h2>People Folders</h2>
          <div className="person-list">
            {people.map((person) => (
              <button
                key={person.id}
                type="button"
                className={`person-card${person.id === selectedPersonId ? ' active' : ''}`}
                onClick={() => {
                  setSelectedPersonId(person.id)
                  setGiftPersonId(person.id)
                }}
              >
                <span className="ribbon" aria-hidden="true"></span>
                <span className="person-name">{person.name}</span>
                <span className="person-count">
                  {gifts.filter((gift) => gift.person_id === person.id && gift.status !== 'gifted').length} active
                </span>
              </button>
            ))}
          </div>

          <form onSubmit={handleAddPerson} className="mini-form">
            <label>
              New Person Folder
              <input
                value={newPersonName}
                onChange={(event) => setNewPersonName(event.target.value)}
                placeholder="Taylor"
              />
            </label>
            <button type="submit">Add Person</button>
          </form>

          <form onSubmit={handleAddEvent} className="mini-form">
            <label>
              Event Name
              <input
                value={newEventName}
                onChange={(event) => setNewEventName(event.target.value)}
                placeholder="Birthday"
              />
            </label>
            <label>
              Event Date
              <input
                type="date"
                value={newEventDate}
                onChange={(event) => setNewEventDate(event.target.value)}
              />
            </label>
            <button type="submit">Add Event</button>
          </form>
        </aside>

        <section className="main-panel">
          <div className="panel-heading">
            <h2>{selectedPerson ? `${selectedPerson.name}'s ideas` : 'Pick a person folder'}</h2>
            <div className="filters">
              <label>
                Event
                <select
                  value={eventFilterId}
                  onChange={(event) => setEventFilterId(event.target.value)}
                >
                  <option value="all">All events</option>
                  {events.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={showGifted}
                  onChange={(event) => setShowGifted(event.target.checked)}
                />
                Show gifted
              </label>
            </div>
          </div>

          <form onSubmit={handleAddGift} className="gift-form">
            <div className="source-tabs">
              <button
                type="button"
                className={giftSourceType === 'text' ? 'active' : ''}
                onClick={() => setGiftSourceType('text')}
              >
                Text
              </button>
              <button
                type="button"
                className={giftSourceType === 'link' ? 'active' : ''}
                onClick={() => setGiftSourceType('link')}
              >
                Link
              </button>
              <button
                type="button"
                className={giftSourceType === 'image' ? 'active' : ''}
                onClick={() => setGiftSourceType('image')}
              >
                Photo
              </button>
            </div>

            <div className="gift-fields">
              <label>
                Gift Title
                <input
                  value={giftTitle}
                  onChange={(event) => setGiftTitle(event.target.value)}
                  placeholder="Linen travel tote"
                  required
                />
              </label>

              <label>
                Person Folder
                <select
                  value={giftPersonId}
                  onChange={(event) => setGiftPersonId(event.target.value)}
                >
                  <option value="">Choose person</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Event (optional)
                <select
                  value={giftEventId}
                  onChange={(event) => setGiftEventId(event.target.value)}
                >
                  <option value="">No event</option>
                  {events.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.event_date ? ` (${friendlyDate(item.event_date)})` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Price (optional)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={giftPrice}
                  onChange={(event) => setGiftPrice(event.target.value)}
                  placeholder="29.99"
                />
              </label>

              {giftSourceType === 'link' ? (
                <label>
                  Link URL
                  <div className="inline-input-row">
                    <input
                      value={giftSourceUrl}
                      onChange={(event) => {
                        setGiftSourceUrl(event.target.value)
                        setLinkPreview(null)
                      }}
                      onBlur={handleFetchPreview}
                      placeholder="https://example.com/item"
                    />
                    <button type="button" className="ghost" onClick={handleFetchPreview}>
                      Preview
                    </button>
                  </div>
                </label>
              ) : null}

              {giftSourceType === 'image' ? (
                <label>
                  Photo or Screenshot
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => setGiftImageFile(event.target.files?.[0] ?? null)}
                  />
                </label>
              ) : null}

              <label className="notes-field">
                Notes
                <textarea
                  value={giftNotes}
                  onChange={(event) => setGiftNotes(event.target.value)}
                  placeholder="Color, size, reason they would love it..."
                />
              </label>

              {linkPreview?.title || linkPreview?.imageUrl ? (
                <article className="link-preview">
                  <p>
                    <strong>{linkPreview.title || 'Link preview'}</strong>
                    {linkPreview.provider ? ` from ${linkPreview.provider}` : ''}
                  </p>
                  {linkPreview.imageUrl ? (
                    <img src={linkPreview.imageUrl} alt="Link preview" />
                  ) : null}
                </article>
              ) : null}
            </div>

            <div className="form-actions">
              <button type="submit" disabled={giftFormBusy}>
                {giftFormBusy ? 'Saving...' : 'Save Gift Idea'}
              </button>
              <button type="button" className="ghost" onClick={clearGiftForm}>
                Clear
              </button>
            </div>
          </form>

          {isDataLoading ? <p className="loading-pill">Loading gifts...</p> : null}
          {dataError ? <p className="message error">{dataError}</p> : null}

          <div className="gift-list">
            {filteredGifts.map((gift) => {
              const event = events.find((item) => item.id === gift.event_id)

              return (
                <article key={gift.id} className={`gift-card status-${gift.status}`}>
                  <header>
                    <div>
                      <h3>{gift.title}</h3>
                      <p className="meta-row">
                        <span className="badge">{gift.source_type}</span>
                        {gift.price ? <span className="badge">${gift.price.toFixed(2)}</span> : null}
                        {event ? <span className="badge">{event.name}</span> : null}
                      </p>
                    </div>
                    <p className="status-text">{gift.status === 'gifted' ? 'Gifted' : 'Idea'}</p>
                  </header>

                  {gift.source_type === 'link' && gift.source_url ? (
                    <a href={gift.source_url} target="_blank" rel="noreferrer" className="gift-link">
                      {gift.source_url}
                    </a>
                  ) : null}

                  {gift.source_type === 'image' && gift.image_path ? (
                    giftImageUrls[gift.id] ? (
                      <img
                        className="gift-image"
                        src={giftImageUrls[gift.id]}
                        alt={gift.title}
                      />
                    ) : (
                      <p className="meta-row">Image loading...</p>
                    )
                  ) : null}

                  {gift.notes ? <p className="notes">{gift.notes}</p> : null}

                  <footer>
                    <button type="button" onClick={() => toggleGiftStatus(gift)}>
                      Mark as {gift.status === 'idea' ? 'Gifted' : 'Idea'}
                    </button>
                    <button type="button" className="ghost danger" onClick={() => deleteGift(gift)}>
                      Delete
                    </button>
                  </footer>
                </article>
              )
            })}

            {!filteredGifts.length && selectedPerson ? (
              <p className="empty-state">
                No matching gifts yet. Save your first idea for {selectedPerson.name}.
              </p>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  )
}

export default App
