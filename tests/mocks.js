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
  }
];

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

export const MOCK_PASSKEYS = [
  {
    id: 'pk-1',
    user_id: MOCK_USER_ID,
    created_at: '2026-05-27T00:00:00Z',
    last_used_at: '2026-05-28T00:00:00Z'
  }
];


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
      if (url.includes('id=eq.')) {
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
}
