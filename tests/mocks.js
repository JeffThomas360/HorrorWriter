export const MOCK_USER_ID = 'da141b7f-712c-47bc-9173-mockuserid01';

export const MOCK_SESSION = {
  access_token: 'mock-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  refresh_token: 'mock-refresh-token',
  user: {
    id: MOCK_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'testwriter@horrorwriter.org',
    email_confirmed_at: '2026-05-26T00:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: '2026-05-26T00:00:00Z',
    updated_at: '2026-05-26T00:00:00Z'
  },
  expires_at: 9999999999
};

export const MOCK_PROFILE = {
  id: MOCK_USER_ID,
  handle: 'testwriter',
  display_name: 'Test Writer',
  bio: 'I write scary stories in the dark.',
  location: 'The Witching Hour',
  pronouns: 'they/them',
  website_url: 'https://horrorwriter.org',
  avatar_url: null,
  created_at: '2026-05-26T00:00:00Z',
  mod_role: null,
  mod_scope: 'all'
};

export const MOCK_CATEGORIES = [
  { id: 'cat-1', name: 'Critique · feedback', sort_order: 1 },
  { id: 'cat-2', name: 'Lore · worldbuilding', sort_order: 2 }
];

export const MOCK_THREADS = [
  {
    id: 'thread-1',
    title: 'The Haunting of Hill House Discussion',
    category_id: 'cat-1',
    author_id: MOCK_USER_ID,
    replies_count: 2,
    pinned: true,
    created_at: '2026-05-26T12:00:00Z',
    updated_at: '2026-05-26T13:00:00Z',
    profiles: { handle: 'testwriter' },
    categories: { name: 'Critique · feedback' }
  },
  {
    id: 'thread-2',
    title: 'Drafting my first gothic short story',
    category_id: 'cat-2',
    author_id: MOCK_USER_ID,
    replies_count: 0,
    pinned: false,
    created_at: '2026-05-25T15:00:00Z',
    updated_at: '2026-05-25T15:00:00Z',
    profiles: { handle: 'testwriter' },
    categories: { name: 'Lore · worldbuilding' }
  }
];

export const MOCK_POSTS = [
  {
    id: 'post-1',
    thread_id: 'thread-1',
    author_id: MOCK_USER_ID,
    content: 'Let us talk about the structure of the opening sentence. It is perfect.',
    created_at: '2026-05-26T12:00:00Z',
    profiles: { handle: 'testwriter' }
  },
  {
    id: 'post-2',
    thread_id: 'thread-1',
    author_id: 'user-2',
    content: 'Agreed, it sets the tone immediately.',
    created_at: '2026-05-26T12:30:00Z',
    profiles: { handle: 'goth_reader' }
  }
];

export const MOCK_BOOKS = [
  {
    id: 'book-1',
    title: 'The Shadow over Innsmouth',
    lede: 'A traveler discovers a degenerate breed of fish-people in a decaying seaport.',
    cover: 'blood',
    content: 'It was during the winter of 1927-28 that the Federal government initiated a secret investigation...',
    author_id: MOCK_USER_ID,
    chapters_info: 'Complete',
    comments_count: 3,
    badge: 'COMPLETE',
    created_at: '2026-05-26T10:00:00Z',
    profiles: { handle: 'testwriter' }
  },
  {
    id: 'book-2',
    title: 'A Standalone Tale',
    lede: 'A story that has never belonged to any series.',
    cover: 'bone',
    content: 'It stood alone, as it always had.',
    author_id: MOCK_USER_ID,
    chapters_info: null,
    comments_count: 0,
    badge: null,
    created_at: '2026-06-01T09:00:00Z',
    profiles: { handle: 'testwriter' }
  }
];

export const MOCK_SERIES = [
  {
    id: 'series-1',
    author_id: MOCK_USER_ID,
    title: 'The Hollow Chronicles',
    description: 'A three-part descent into the house that remembers.',
    created_at: '2026-05-20T00:00:00Z',
    profiles: { handle: 'testwriter' }
  }
];

export const MOCK_SERIES_BOOKS = [
  {
    series_id: 'series-1',
    sort_order: 0,
    // Shaped to satisfy both series.js query variants that hit this route:
    // fetchSeriesWithBooks/fetchMySeriesWithBooks select `books:book_id(...)` (nested "books"),
    // while fetchMyBooks selects `book_id, series:series_id(...)` (flat "book_id" + nested "series").
    // The mock doesn't branch on the `select=` param, so both shapes are included here.
    book_id: 'book-1',
    books: { id: 'book-1', title: 'The Shadow over Innsmouth', series_teaser: 'It was during the winter...', created_at: '2026-05-26T10:00:00Z', author_id: MOCK_USER_ID },
    series: { id: 'series-1', title: 'The Hollow Chronicles' }
  }
];

// Reader-side fixture: a full three-part series, matching MOCK_SERIES[0]'s
// description ("A three-part descent into the house that remembers").
//
// This is DELIBERATELY separate from MOCK_SERIES_BOOKS rather than an extension
// of it. Two existing tests depend on that fixture having exactly one row:
//   - mySeries.spec.js "reorders a story within a series" uses
//     page.getByLabel('Position') with no .first(); a second row makes the
//     locator ambiguous and Playwright strict mode fails it.
//   - mySeries.spec.js "assigns an unassigned story" needs book-2 to stay
//     unassigned, so book-2 must never appear here either.
// Reader specs opt in by overriding the series_books route locally.
export const MOCK_SERIES_PARTS = [
  {
    series_id: 'series-1',
    sort_order: 0,
    book_id: 'book-1',
    books: { id: 'book-1', title: 'The Shadow over Innsmouth', series_teaser: 'It was during the winter...', created_at: '2026-05-26T10:00:00Z', author_id: MOCK_USER_ID },
    series: { id: 'series-1', title: 'The Hollow Chronicles' }
  },
  {
    series_id: 'series-1',
    sort_order: 1,
    book_id: 'book-3',
    books: { id: 'book-3', title: 'The Doorway in the Cellar', series_teaser: 'Something had been counting the stairs.', created_at: '2026-05-27T10:00:00Z', author_id: MOCK_USER_ID },
    series: { id: 'series-1', title: 'The Hollow Chronicles' }
  },
  {
    series_id: 'series-1',
    sort_order: 2,
    book_id: 'book-4',
    books: { id: 'book-4', title: 'What the House Remembered', series_teaser: 'It knew our names before we arrived.', created_at: '2026-05-28T10:00:00Z', author_id: MOCK_USER_ID },
    series: { id: 'series-1', title: 'The Hollow Chronicles' }
  }
];

// Opt-in override: serve the three-part series on the series_books read path.
// Call AFTER setupSupabaseMocks(page) — the last matching route wins in Playwright.
export async function setupSeriesPartsMock(page, parts = MOCK_SERIES_PARTS) {
  await page.route('**/rest/v1/series_books*', async (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(parts)
      });
    } else {
      route.fallback();
    }
  });
}

// Opt-in override for IN-STORY navigation tests (ReadStory.jsx via
// fetchStorySeriesContext). Use this INSTEAD OF setupSeriesPartsMock, not
// alongside it — this supersedes the same route with a shape-aware handler.
//
// Why the plain array from setupSeriesPartsMock isn't enough:
// fetchStorySeriesContext (src/lib/series.js) fires two different queries
// against series_books:
//   1. .eq('book_id', bookId).single()   -> "which series is this book in"
//      PostgREST's .single() expects ONE row back, not an array.
//   2. .eq('series_id', seriesId)        -> the full ordered part list
// A single unconditional array response satisfies query 2 but silently
// breaks query 1's .single() semantics.
//
// It also fixes the books route, which otherwise always returns MOCK_BOOKS[0]
// regardless of which id was requested — meaning every part in a series would
// render the same title/content, and prev/next navigation couldn't be told
// apart in a test even though the URL changed correctly.
export async function setupSeriesReaderMocks(page, parts = MOCK_SERIES_PARTS) {
  await page.route('**/rest/v1/series_books*', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();

    const url = route.request().url();
    const bookIdMatch = url.match(/[?&]book_id=eq\.([^&]+)/);

    if (bookIdMatch) {
      const bookId = decodeURIComponent(bookIdMatch[1]);
      const row = parts.find((p) => p.book_id === bookId);
      if (!row) {
        // Real PostgREST: .single() with zero matching rows is a 406.
        route.fulfill({
          status: 406,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'JSON object requested, multiple (or no) rows returned' })
        });
        return;
      }
      // .single() shape: a bare object, not an array.
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ series_id: row.series_id })
      });
      return;
    }

    // series_id=eq. (or anything else GET): full ordered list, array shape.
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(parts) });
  });

  await page.route('**/rest/v1/books*', async (route) => {
    const url = route.request().url();
    if (route.request().method() !== 'GET' || !/[?&]id=eq\./.test(url)) return route.fallback();

    const bookId = decodeURIComponent(url.match(/[?&]id=eq\.([^&]+)/)[1]);
    const part = parts.find((p) => p.book_id === bookId);
    const book = part
      ? {
          ...part.books,
          lede: 'A story in this series.',
          content: `Chapter content for "${part.books.title}."`,
          comments_count: 0,
          profiles: { handle: 'testwriter' }
        }
      : MOCK_BOOKS[0];

    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(book) });
  });
}

export const MOCK_BOOK_COMMENTS = [
  {
    id: 'comment-1',
    book_id: 'book-1',
    author_id: 'user-2',
    content: 'The description of Innsmouth is incredibly atmospheric. Love the pacing here.',
    created_at: '2026-05-26T11:00:00Z',
    profiles: { handle: 'goth_reader' }
  }
];

export const MOCK_REPORTS = [
  {
    id: 'report-1',
    target_type: 'site',
    target_id: null,
    reporter_id: MOCK_USER_ID,
    category: 'other',
    details: 'The site is broken on my fridge.',
    status: 'open',
    created_at: '2026-06-10T00:00:00Z',
    profiles: { handle: 'testwriter' }
  }
];

export const MOCK_NOTIFICATIONS = [
  {
    id: 'notif-1',
    kind: 'report_resolved',
    title: 'Your report was resolved',
    body: 'A moderator reviewed the thread you reported.',
    read_at: null,
    created_at: '2026-07-01T12:00:00Z'
  },
  {
    id: 'notif-2',
    kind: 'content_actioned',
    title: 'Your post was hidden',
    body: 'A moderator hid one of your forum replies for violating the rules.',
    read_at: null,
    created_at: '2026-06-30T09:00:00Z'
  },
  {
    id: 'notif-3',
    kind: 'report_resolved',
    title: 'Your report was resolved',
    body: null,
    read_at: '2026-06-28T00:00:00Z',
    created_at: '2026-06-27T00:00:00Z'
  }
];

// The admin user directory. Only the columns fetchAllUsers selects.
export const MOCK_DIRECTORY = [
  { id: MOCK_USER_ID, handle: 'testwriter', display_name: 'Test Writer', avatar_url: null, mod_role: null, mod_scope: 'all', banned_until: null, is_shadowbanned: false, requires_screening: false, created_at: '2026-05-26T00:00:00Z' },
  { id: 'user-warden', handle: 'warden_wendy', display_name: 'Warden Wendy', avatar_url: null, mod_role: 'warden', mod_scope: 'all', banned_until: null, is_shadowbanned: false, requires_screening: false, created_at: '2026-06-01T00:00:00Z' },
  { id: 'user-newbie', handle: 'spooky_newbie', display_name: 'Spooky Newbie', avatar_url: null, mod_role: null, mod_scope: 'all', banned_until: null, is_shadowbanned: false, requires_screening: true, created_at: '2026-06-02T00:00:00Z' },
];

// site_settings has one row (id 1); these match the production defaults.
export const MOCK_SITE_SETTINGS = {
  id: 1,
  registration_open: true,
  maintenance_mode: false,
  maintenance_message: null,
  announcement_text: null,
  announcement_active: false,
  announcement_severity: 'info',
};

export const MOCK_MOD_ACTIONS = [
  {
    id: 'action-1',
    action: 'site_setting_changed',
    target_type: null,
    target_id: null,
    target_user_id: null,
    reason: 'registration_open: true',
    created_at: '2026-10-01T00:00:00Z',
    profiles: { handle: 'testwriter' }
  }
];

export const MOCK_PASSKEYS = [
  {
    id: 'pk-1',
    user_id: MOCK_USER_ID,
    created_at: '2026-05-27T00:00:00Z',
    last_used_at: '2026-05-28T00:00:00Z'
  }
];

// Member tickets. One ticket the Keeper has answered and the member has not opened
// yet: the shape TicketReplyBanner's query (status=answered, member_seen_at is null)
// and /my-tickets/ both read. `ticket_messages` is the embedded conversation.
export const MOCK_TICKET_ID = '3f2b8c1e-5a7d-4e9a-9c3b-1d2e3f4a5b6c';

export const MOCK_TICKET = {
  id: MOCK_TICKET_ID,
  user_id: MOCK_USER_ID,
  topic: 'broken',
  subject: 'The editor will not save my story',
  status: 'answered',
  close_reason: null,
  member_seen_at: null,
  created_at: '2026-10-27T10:00:00Z',
  updated_at: '2026-10-27T12:00:00Z',
  ticket_messages: [
    {
      id: 'tmsg-1',
      from_keeper: false,
      body: 'Every time I press save the editor spins and nothing happens.',
      created_at: '2026-10-27T10:00:00Z'
    },
    {
      id: 'tmsg-2',
      from_keeper: true,
      body: 'Found it. Try again now; it should save.',
      created_at: '2026-10-27T12:00:00Z'
    }
  ]
};

// Cloudflare Turnstile. Under Playwright the widget uses Cloudflare's always-pass
// test key, but it still loads the real script from challenges.cloudflare.com. This
// serves a stand-in that hands the page a token ('tok') the moment a widget renders,
// and a fresh one after reset(), so a spec never waits on the network or a challenge.
// `token: null` gives a widget that never answers (Send / the email button stay
// disabled). `setupSupabaseMocks` installs the default; call this after it to override
// (the last matching route wins).
export async function setupTurnstileStub(page, { token = 'tok' } = {}) {
  const script = `
    (function () {
      var token = ${JSON.stringify(token)};
      var widgets = {};
      var next = 0;
      function issue(id) {
        var opts = widgets[id];
        if (token !== null && opts && typeof opts.callback === 'function') {
          setTimeout(function () { if (widgets[id]) opts.callback(token); }, 0);
        }
      }
      window.turnstile = {
        render: function (el, opts) { var id = 'w' + (++next); widgets[id] = opts; issue(id); return id; },
        reset: function (id) { issue(id); },
        remove: function (id) { delete widgets[id]; }
      };
    })();
  `;
  await page.route('https://challenges.cloudflare.com/**', async (route) => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: script });
  });
}

// Tripwire for specs that must never touch the real database (local dev points at
// production). Call it BEFORE setupSupabaseMocks: routes registered earlier are
// consulted last, so this only sees the Supabase requests no mock claimed. It aborts
// them and returns the list, for the spec to assert is empty.
export async function trapUnmockedSupabase(page) {
  const leaked = [];
  await page.route(/^https:\/\/[a-z0-9-]+\.supabase\.co\//, async (route) => {
    leaked.push(`${route.request().method()} ${route.request().url()}`);
    route.abort();
  });
  return leaked;
}


// Helper to inject mock auth session to localStorage
export async function setupMockAuth(page) {
  await page.addInitScript((session) => {
    localStorage.setItem('sb-bmvvugrfnuedjlucmlbw-auth-token', JSON.stringify(session));
  }, MOCK_SESSION);
}

// Intercept REST calls
export async function setupSupabaseMocks(page, opts = {}) {
  const selfProfile = { ...MOCK_PROFILE, mod_role: opts.mod_role ?? null, mod_scope: 'all' };

  await page.route('**/rest/v1/profiles*', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      const url = route.request().url();
      if (url.includes('handle=eq.')) {
        route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify([
            { id: 'user-warden', handle: 'warden_wendy', display_name: 'Warden Wendy', avatar_url: null, mod_role: 'warden', mod_scope: 'all', created_at: '2026-06-01T00:00:00Z' }
          ]),
        })
      } else if (url.includes('handle=ilike.')) {
        route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify([
            { id: 'user-warden', handle: 'warden_wendy', display_name: 'Warden Wendy', avatar_url: null, mod_role: 'warden', mod_scope: 'all', created_at: '2026-06-01T00:00:00Z' },
            { id: 'user-newbie', handle: 'spooky_newbie', display_name: 'Spooky Newbie', avatar_url: null, mod_role: null, mod_scope: 'all', created_at: '2026-06-02T00:00:00Z' },
          ]),
        })
      } else if (url.includes('order=created_at')) {
        // The admin user directory (fetchAllUsers): every profile, newest first.
        route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify(MOCK_DIRECTORY.map((u) => (u.id === MOCK_USER_ID ? { ...u, mod_role: selfProfile.mod_role } : u))),
        })
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(selfProfile)
        });
      }
    } else if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(selfProfile)
      });
    }
  });

  await page.route('**/rest/v1/categories*', async (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CATEGORIES)
    });
  });

  await page.route('**/rest/v1/threads*', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      const url = route.request().url();
      if (url.includes('id=eq.')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_THREADS[0])
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_THREADS)
        });
      }
    } else if (method === 'POST') {
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_THREADS[0])
      });
    } else if (method === 'PATCH' || method === 'PUT') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok' })
      });
    }
  });

  await page.route('**/rest/v1/posts*', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_POSTS)
      });
    } else if (method === 'POST') {
      const postData = JSON.parse(route.request().postData() || '{}');
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'post-new',
          thread_id: 'thread-1',
          author_id: MOCK_USER_ID,
          content: postData.content || '',
          created_at: new Date().toISOString(),
          profiles: { handle: 'testwriter' }
        })
      });
    } else if (method === 'PATCH' || method === 'PUT') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok' })
      });
    }
  });

  await page.route('**/rest/v1/books*', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      const url = route.request().url();
      if (/[?&]id=eq\./.test(url)) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_BOOKS[0])
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_BOOKS)
        });
      }
    } else if (method === 'POST') {
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_BOOKS[0])
      });
    } else if (method === 'PATCH' || method === 'PUT') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok' })
      });
    }
  });

  await page.route('**/rest/v1/series*', async (route) => {
    const method = route.request().method();
    const url = route.request().url();
    if (method === 'GET') {
      if (/[?&]id=eq\./.test(url)) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_SERIES[0])
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_SERIES)
        });
      }
    } else if (method === 'POST') {
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'series-new' })
      });
    } else if (method === 'DELETE') {
      route.fulfill({ status: 204, body: '' });
    }
  });

  await page.route('**/rest/v1/series_books*', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SERIES_BOOKS)
      });
    } else if (method === 'POST') {
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({}) });
    } else if (method === 'PATCH' || method === 'PUT') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
    } else if (method === 'DELETE') {
      route.fulfill({ status: 204, body: '' });
    }
  });

  await page.route('**/rest/v1/book_comments*', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_BOOK_COMMENTS)
      });
    } else if (method === 'POST') {
      const commentData = JSON.parse(route.request().postData() || '{}');
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'comment-new',
          book_id: 'book-1',
          author_id: MOCK_USER_ID,
          content: commentData.content || '',
          created_at: new Date().toISOString(),
          profiles: { handle: 'testwriter' }
        })
      });
    } else if (method === 'PATCH' || method === 'PUT') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok' })
      });
    }
  });

  // Passkey credentials table mockup
  await page.route('**/rest/v1/passkey_credentials*', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_PASSKEYS)
      });
    } else if (method === 'DELETE') {
      route.fulfill({
        status: 204,
        contentType: 'application/json'
      });
    }
  });

  // WebAuthn Begin/Complete Edge Functions
  await page.route('**/functions/v1/webauthn-register-begin', async (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        challenge: 'bW9ja19jaGFsbGVuZ2VfdmFsdWVfZm9yX3Rlc3Q',
        rp: { name: 'HorrorWriter', id: 'localhost' },
        user: { id: 'bW9ja191c2VyX2lk', name: 'testwriter', displayName: 'Test Writer' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 }
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'cross-platform',
          requireResidentKey: true,
          userVerification: 'required'
        }
      })
    });
  });

  await page.route('**/functions/v1/webauthn-register-complete', async (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' })
    });
  });

  await page.route('**/functions/v1/webauthn-authenticate-begin', async (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        challenge: 'bW9ja19jaGFsbGVuZ2VfdmFsdWVfZm9yX3Rlc3Q',
        rpId: 'localhost',
        allowCredentials: [],
        userVerification: 'preferred'
      })
    });
  });

  await page.route('**/functions/v1/webauthn-authenticate-complete', async (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token_hash: 'mock_token_hash',
        email: 'testwriter@horrorwriter.org'
      })
    });
  });

  // Supabase Auth OTP verification (for exchange of token_hash -> session)
  await page.route('**/auth/v1/verify*', async (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'mock-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'mock-refresh-token',
        user: {
          id: MOCK_USER_ID,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'testwriter@horrorwriter.org',
          email_confirmed_at: '2026-05-26T00:00:00Z',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
          identities: [],
          created_at: '2026-05-26T00:00:00Z',
          updated_at: '2026-05-26T00:00:00Z'
        },
        expires_at: 9999999999
      })
    });
  });

  // RPC mock for create_thread_with_post
  await page.route('**/rest/v1/rpc/create_thread_with_post*', async (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify('thread-1')
    });
  });

  // Reports mock
  await page.route('**/rest/v1/reports*', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_REPORTS)
      });
    } else if (method === 'POST') {
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_REPORTS[0])
      });
    } else if (method === 'PATCH' || method === 'PUT') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok' })
      });
    }
  });

  // Notifications: HEAD request is the unread-count query (count via Content-Range header),
  // GET is the list, PATCH is mark-read / mark-all-read.
  await page.route('**/rest/v1/notifications*', async (route) => {
    const method = route.request().method();
    const unread = MOCK_NOTIFICATIONS.filter((n) => !n.read_at).length;
    if (method === 'HEAD') {
      route.fulfill({
        status: 200,
        headers: {
          'content-range': `0-0/${unread}`,
          'access-control-expose-headers': 'content-range'
        }
      });
    } else if (method === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_NOTIFICATIONS)
      });
    } else if (method === 'PATCH') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok' })
      });
    }
  });

  await page.route('**/rest/v1/mod_role_badges*', async (route) => {
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([
        { role: 'keeper', emoji: '🗝️', label: 'Keeper' },
        { role: 'warden', emoji: '🕯️', label: 'Warden' },
        { role: 'moderator', emoji: '👁️', label: 'Moderator' },
        { role: 'sentinel', emoji: '🔦', label: 'Sentinel' },
      ]),
    })
  });

  // Admin panel reads. Writes go through RPCs (set_site_setting etc.) and are
  // left unmocked: no admin test saves anything.
  const jsonGet = (body) => async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  };
  await page.route('**/rest/v1/site_settings*', jsonGet(MOCK_SITE_SETTINGS));
  await page.route('**/rest/v1/mod_actions*', jsonGet(MOCK_MOD_ACTIONS));
  await page.route('**/rest/v1/keeper_tasks*', jsonGet([]));
  await page.route('**/rest/v1/ritual_prompts*', jsonGet([]));

  // Post-publish screening (src/lib/screenContent.js). Never reaches the real
  // function from a test.
  await page.route('**/functions/v1/moderate-content', async (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  // Signed-in /profile checks for sealed writing waiting to be restored, and lists the
  // member's kept Ritual entries. Neither exists in a test; without these the requests
  // go to the real project.
  await page.route('**/functions/v1/sealed-writing*', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ waiting: false }) });
  });
  await page.route('**/rest/v1/ritual_vault*', jsonGet([]));

  // Sign out tells the server to end the session. Unanswered, the request fails, the
  // client keeps the session, and the member is never signed out.
  await page.route('**/auth/v1/logout*', async (route) => {
    route.fulfill({ status: 204, body: '' });
  });

  // The home page's MidnightRitual asks when the next prompt unlocks. With no
  // ritual_prompts (mocked empty above) the answer is "nothing scheduled": null.
  await page.route('**/rest/v1/rpc/ritual_next_unlock*', async (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });

  // Member tickets. TicketReplyBanner mounts on every page, so a signed-in spec asks
  // for tickets whether or not it cares: the default is "no tickets". Pass
  // `{ tickets: [MOCK_TICKET] }` for a member with an unseen Keeper answer. The
  // handler honours the filters the client sends (status, member_seen_at, user_id, id,
  // limit), so the banner only gets the row its query actually asks for.
  const ticketRows = (url) => {
    const q = new URL(url).searchParams;
    const eq = (key) => (q.get(key)?.startsWith('eq.') ? q.get(key).slice(3) : null);
    let rows = opts.tickets ?? [];
    if (eq('status')) rows = rows.filter((t) => t.status === eq('status'));
    if (eq('user_id')) rows = rows.filter((t) => t.user_id === eq('user_id'));
    if (eq('id')) rows = rows.filter((t) => t.id === eq('id'));
    if (q.get('member_seen_at') === 'is.null') rows = rows.filter((t) => !t.member_seen_at);
    if (Number(q.get('limit'))) rows = rows.slice(0, Number(q.get('limit')));
    return rows;
  };
  await page.route('**/rest/v1/tickets*', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ticketRows(route.request().url()))
    });
  });
  // The conversation is normally embedded in the tickets select; this is for a read
  // of the table directly.
  await page.route('**/rest/v1/ticket_messages*', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const messages = (opts.tickets ?? []).flatMap((t) => t.ticket_messages ?? []);
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(messages) });
  });

  // Opening a ticket goes through the open-ticket Edge Function, which verifies the
  // Turnstile token with the production secret: a test token would be refused, and
  // nothing a test does may reach the real function.
  await page.route('**/functions/v1/open-ticket', async (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: MOCK_TICKET_ID })
    });
  });

  // Turnstile's script (sign-in modal email form, Help ticket form).
  await setupTurnstileStub(page);

  // Count queries (`select('id', { count: 'exact', head: true })`, e.g. the admin
  // Overview's stats) are HEAD requests. The table handlers above only answer
  // GET/POST/PATCH, and a handler that answers nothing hangs the request, so
  // every HEAD gets a count here. Registered last = consulted first; anything
  // that isn't a HEAD falls through to the table handlers. Notifications keep
  // their own unread count.
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().method() !== 'HEAD' || route.request().url().includes('/notifications')) {
      return route.fallback();
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-2/3', 'access-control-expose-headers': 'content-range' },
      body: ''
    });
  });
}
