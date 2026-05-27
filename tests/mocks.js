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
  created_at: '2026-05-26T00:00:00Z'
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

// Helper to inject mock auth session to localStorage
export async function setupMockAuth(page) {
  await page.addInitScript((session) => {
    localStorage.setItem('sb-bmvvugrfnuedjlucmlbw-auth-token', JSON.stringify(session));
  }, MOCK_SESSION);
}

// Intercept REST calls
export async function setupSupabaseMocks(page) {
  await page.route('**/rest/v1/profiles*', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_PROFILE)
      });
    } else if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_PROFILE)
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
    }
  });
}
