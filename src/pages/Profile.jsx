import { useOutletContext } from 'react-router-dom'

const DEMO = {
  initial: 'L',
  name: 'Lin Carver',
  handle: '@lin-carver',
  bio: 'Writing horror that climbs under the skin and stays there. Finalist, Shirley Jackson Award 2024. She/her.',
  location: 'Portland, OR',
  joined: 'Member since October 1986',
  badges: [
    { label: 'Critique Circle',  cls: ''     },
    { label: 'Ritual Winner',    cls: 'cyan' },
    { label: 'First Blood',      cls: 'red'  },
  ],
  works: [
    { title: 'Static Mother',         genre: 'Psychological Horror', when: '2 days ago'  },
    { title: 'The Last Sunday',       genre: 'Folk Horror',          when: '1 month ago' },
    { title: 'What the Mirror Keeps', genre: 'Gothic',               when: '3 months ago'},
  ],
  activity: [
    { title: 'Replied to "My MC won\'t bleed"',          when: '14 min ago'  },
    { title: 'Submitted to Ritual #17',                  when: '2 days ago'  },
    { title: 'Critiqued "The Drowning Lessons" (Ch. 1)', when: '1 week ago'  },
  ],
}

export default function Profile() {
  const ctx = useOutletContext()

  return (
    <section className="surface active">
      <div className="profile-head">
        <div className="profile-avatar">{DEMO.initial}</div>
        <div className="profile-info">
          <h3>{DEMO.name}</h3>
          <div className="handle">{DEMO.handle}</div>
          <p className="bio">{DEMO.bio}</p>
          <div className="joined">{DEMO.location} · {DEMO.joined}</div>
          <div className="badges">
            {DEMO.badges.map((b, i) => (
              <span key={i} className={`badge-chip${b.cls ? ' '+b.cls : ''}`}>{b.label}</span>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{ marginBottom:32, padding:'16px 20px', border:'1px dashed rgba(243,236,217,.18)',
          borderRadius:'var(--r)', fontFamily:'var(--mono)', fontSize:15,
          color:'var(--bone-dim)', letterSpacing:'.1em' }}
      >
        ⚠ DEMO PROFILE — Sign in to view and edit your own profile.&nbsp;
        <button
          style={{ color:'var(--cyan)', textDecoration:'underline', cursor:'pointer',
            fontFamily:'var(--mono)', fontSize:15 }}
          onClick={() => ctx?.openSignin()}
        >
          Sign in
        </button>
      </div>

      <div className="profile-cols">
        <div>
          <div className="col-title">Shared Work</div>
          {DEMO.works.map((w, i) => (
            <div key={i} className="work">
              <div>
                <h5>{w.title}</h5>
                <p>{w.genre}</p>
              </div>
              <div className="when">{w.when}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="col-title">Recent Activity</div>
          {DEMO.activity.map((a, i) => (
            <div key={i} className="work">
              <div>
                <h5 style={{ fontSize:17 }}>{a.title}</h5>
              </div>
              <div className="when">{a.when}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
