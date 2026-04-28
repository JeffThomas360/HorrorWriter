import { useParams } from 'react-router-dom'

const DEMO_PROFILES = {
  'lin-carver': {
    initial:'L', name:'Lin Carver', handle:'@lin-carver',
    bio:'Writing horror that climbs under the skin and stays there. Finalist, Shirley Jackson Award 2024.',
    location:'Portland, OR', joined:'October 2023',
    badges:[{label:'Critique Circle',cls:''},{label:'Ritual Winner',cls:'cyan'},{label:'First Blood',cls:'red'}],
    works:[
      {title:'Static Mother',genre:'Psychological Horror',when:'2 days ago'},
      {title:'The Last Sunday',genre:'Folk Horror',when:'1 month ago'},
    ],
  },
  'marigold-rotten': {
    initial:'M', name:'Marigold Rotten', handle:'@marigold-rotten',
    bio:'Folk horror and rot. Writing in the margins of grief. She/her.',
    location:'Edinburgh, UK', joined:'September 2023',
    badges:[{label:'Leaderboard Top 3',cls:'cyan'},{label:'Critique Circle',cls:''}],
    works:[
      {title:'The Skin Below',genre:'Body Horror',when:'3 days ago'},
      {title:'The Drowning Lessons',genre:'Folk Horror',when:'2 weeks ago'},
    ],
  },
}

const DEFAULT_PROFILE = {
  initial:'?', name:'Unknown Scribe', handle:'@unknown',
  bio:'This writer has not yet stepped from the shadows.',
  location:'Unknown', joined:'Unknown',
  badges:[], works:[],
}

export default function UserProfile() {
  const { handle } = useParams()
  const profile = DEMO_PROFILES[handle] || { ...DEFAULT_PROFILE, handle: `@${handle}` }

  return (
    <section className="surface active">
      <div className="profile-head">
        <div className="profile-avatar">{profile.initial}</div>
        <div className="profile-info">
          <h3>{profile.name}</h3>
          <div className="handle">{profile.handle}</div>
          <p className="bio">{profile.bio}</p>
          <div className="joined">{profile.location} · Member since {profile.joined}</div>
          <div className="badges">
            {profile.badges.map((b, i) => (
              <span key={i} className={`badge-chip${b.cls ? ' '+b.cls : ''}`}>{b.label}</span>
            ))}
          </div>
        </div>
      </div>

      {profile.works.length > 0 && (
        <div>
          <div className="col-title" style={{ marginBottom:18 }}>Shared Work</div>
          {profile.works.map((w, i) => (
            <div key={i} className="work">
              <div>
                <h5>{w.title}</h5>
                <p>{w.genre}</p>
              </div>
              <div className="when">{w.when}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
