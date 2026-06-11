import { useState } from 'react'
import ModBadge from './ModBadge'

/**
 * Avatar + name + handle + optional meta block. Shared between the editable
 * Profile page and the public UserProfile page.
 *
 * Falls back to the initial letter when avatar_url is missing OR fails to
 * load (broken image, 404, CORS). The fallback survives even after the URL
 * gets set, as long as the image element keeps erroring.
 */
export default function ProfileHead({ profile, children }) {
  const [imageBroken, setImageBroken] = useState(false)
  const initial = (profile.display_name?.[0] || profile.handle?.[0] || '?').toUpperCase()
  const showImage = profile.avatar_url && !imageBroken

  return (
    <div className="profile-head">
      {showImage ? (
        <img
          src={profile.avatar_url}
          alt=""
          className="profile-avatar-img"
          onError={() => setImageBroken(true)}
        />
      ) : (
        <div className="profile-avatar">{initial}</div>
      )}
      <div className="profile-info">
        <h3>
          {profile.display_name || profile.handle}
          <ModBadge role={profile.mod_role} />
        </h3>
        <div className="handle">@{profile.handle}</div>
        {children}
      </div>
    </div>
  )
}
