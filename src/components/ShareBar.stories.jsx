export default {
  title: 'Components/ShareBar',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
};

const ShareBarDemo = ({ title, text, url }) => {
  const shareUrl = url || window.location.href;
  const shareText = text ? `"${text}"\n\n— ${title}` : `Read "${title}" on Horror Writer.`;

  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    shareText
  )}&url=${encodeURIComponent(shareUrl)}`;

  return (
    <div
      style={{
        marginTop: '2rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1.5rem',
        border: '1px solid #2d2d2a',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        padding: '1.5rem',
      }}
    >
      <span
        style={{
          fontSize: '13px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: '#A3A39C',
        }}
      >
        Spread the fear
      </span>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem' }}>
        <a
          href={tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            border: '1px solid #2d2d2a',
            padding: '0.5rem 1rem',
            fontSize: '13px',
            color: '#E5E1D8',
            textDecoration: 'none',
            transition: 'all 0.2s',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.target.style.borderColor = '#991B1B';
            e.target.style.color = '#991B1B';
          }}
          onMouseLeave={(e) => {
            e.target.style.borderColor = '#2d2d2a';
            e.target.style.color = '#E5E1D8';
          }}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.005 4.15H5.059z" />
          </svg>
          Share
        </a>

        <button
          onClick={() => {
            navigator.clipboard.writeText(shareUrl);
            alert('Link copied!');
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            border: '1px solid #2d2d2a',
            padding: '0.5rem 1rem',
            fontSize: '13px',
            color: '#E5E1D8',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.target.style.borderColor = '#991B1B';
            e.target.style.color = '#991B1B';
          }}
          onMouseLeave={(e) => {
            e.target.style.borderColor = '#2d2d2a';
            e.target.style.color = '#E5E1D8';
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
          Link
        </button>
      </div>
    </div>
  );
};

export const Default = {
  render: () => (
    <ShareBarDemo
      title="The Whisper in the Walls"
      text="A haunting tale of secrets and shadows"
      url="https://horrorwriter.org/library/read/123"
    />
  ),
};

export const NoExcerpt = {
  render: () => (
    <ShareBarDemo title="The Whisper in the Walls" url="https://horrorwriter.org/library/read/123" />
  ),
};

export const LongTitle = {
  render: () => (
    <ShareBarDemo
      title="The Extraordinary and Terrifying Chronicles of the Forgotten Manor and the Mysteries That Dwell Within Its Ancient Halls"
      text="When the veil between worlds grows thin..."
      url="https://horrorwriter.org/library/read/456"
    />
  ),
};
