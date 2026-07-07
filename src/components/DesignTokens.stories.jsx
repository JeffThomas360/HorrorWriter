export default {
  title: 'Design System/Tokens',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'HorrorWriter design tokens — colors, typography, and spacing.',
      },
    },
  },
};

export const Colors = () => {
  const tokens = [
    { name: 'Background Primary', hex: '#121212', token: '--color-bg-primary' },
    { name: 'Background Surface', hex: '#1a1a1a', token: '--color-bg-surface' },
    { name: 'Text Primary', hex: '#E5E1D8', token: '--color-text-primary' },
    { name: 'Text Secondary', hex: '#A3A39C', token: '--color-text-secondary' },
    { name: 'Accent Crimson', hex: '#991B1B', token: '--color-accent-crimson' },
  ];

  return (
    <div style={{ padding: '2rem', background: '#121212' }}>
      <h1
        style={{
          fontFamily: 'Cinzel',
          fontSize: '2rem',
          color: '#E5E1D8',
          marginBottom: '2rem',
        }}
      >
        Colors
      </h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1.5rem',
        }}
      >
        {tokens.map(({ name, hex, token }) => (
          <div key={name}>
            <div
              style={{
                width: '100%',
                height: '120px',
                background: hex,
                border: `1px solid #A3A39C`,
                marginBottom: '0.5rem',
              }}
            />
            <p
              style={{
                fontFamily: 'Cinzel',
                fontSize: '0.875rem',
                color: '#E5E1D8',
                margin: '0.5rem 0 0 0',
              }}
            >
              {name}
            </p>
            <p
              style={{
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                color: '#A3A39C',
                margin: '0.25rem 0 0 0',
              }}
            >
              {hex}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export const Typography = () => {
  return (
    <div style={{ padding: '2rem', background: '#121212' }}>
      <h1
        style={{
          fontFamily: 'Cinzel',
          fontSize: '2rem',
          color: '#E5E1D8',
          marginBottom: '2rem',
        }}
      >
        Typography
      </h1>

      <div style={{ maxWidth: '700px', lineHeight: 1.8 }}>
        <div style={{ marginBottom: '3rem' }}>
          <h2
            style={{
              fontFamily: 'Cinzel',
              fontSize: '1.75rem',
              color: '#E5E1D8',
              marginBottom: '0.5rem',
            }}
          >
            Heading 1 (h1) – Cinzel
          </h2>
          <p
            style={{
              fontSize: '0.875rem',
              color: '#A3A39C',
              margin: 0,
            }}
          >
            36px / 1.2 line-height
          </p>
        </div>

        <div style={{ marginBottom: '3rem' }}>
          <h3
            style={{
              fontFamily: 'Cinzel',
              fontSize: '1.5rem',
              color: '#E5E1D8',
              marginBottom: '0.5rem',
            }}
          >
            Heading 2 (h2) – Cinzel
          </h3>
          <p
            style={{
              fontSize: '0.875rem',
              color: '#A3A39C',
              margin: 0,
            }}
          >
            24px / 1.3 line-height
          </p>
        </div>

        <div style={{ marginBottom: '3rem' }}>
          <p
            style={{
              fontFamily: 'Merriweather',
              fontSize: '1rem',
              color: '#E5E1D8',
              marginBottom: '0.5rem',
            }}
          >
            Body text – Merriweather. This is the main reading typeface for longer-form
            content like story text, forum posts, and descriptions. It's optimized for
            readability at 16px and above.
          </p>
          <p
            style={{
              fontSize: '0.875rem',
              color: '#A3A39C',
              margin: '0.5rem 0 0 0',
            }}
          >
            16px / 1.6 line-height
          </p>
        </div>

        <div style={{ marginBottom: '3rem' }}>
          <p
            style={{
              fontFamily: 'Merriweather',
              fontSize: '0.875rem',
              color: '#E5E1D8',
              marginBottom: '0.5rem',
            }}
          >
            Small body text – Merriweather. Used for secondary content, UI labels, and
            metadata.
          </p>
          <p
            style={{
              fontSize: '0.75rem',
              color: '#A3A39C',
              margin: '0.5rem 0 0 0',
            }}
          >
            14px / 1.5 line-height
          </p>
        </div>

        <div>
          <span
            style={{
              fontFamily: 'Cinzel',
              fontSize: '0.75rem',
              color: 'var(--color-accent-crimson)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginRight: '1rem',
            }}
          >
            Label
          </span>
          <p
            style={{
              fontSize: '0.75rem',
              color: '#A3A39C',
              margin: 0,
            }}
          >
            12px uppercase
          </p>
        </div>
      </div>
    </div>
  );
};

export const Spacing = () => {
  const spacingScale = [
    { name: '2px', value: '0.125rem', px: 2 },
    { name: '4px', value: '0.25rem', px: 4 },
    { name: '8px', value: '0.5rem', px: 8 },
    { name: '12px', value: '0.75rem', px: 12 },
    { name: '16px', value: '1rem', px: 16 },
    { name: '24px', value: '1.5rem', px: 24 },
    { name: '32px', value: '2rem', px: 32 },
    { name: '48px', value: '3rem', px: 48 },
    { name: '64px', value: '4rem', px: 64 },
  ];

  return (
    <div style={{ padding: '2rem', background: '#121212' }}>
      <h1
        style={{
          fontFamily: 'Cinzel',
          fontSize: '2rem',
          color: '#E5E1D8',
          marginBottom: '2rem',
        }}
      >
        Spacing Scale
      </h1>

      <div style={{ maxWidth: '500px' }}>
        {spacingScale.map(({ name, value, px }) => (
          <div
            key={name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              marginBottom: '1rem',
            }}
          >
            <div
              style={{
                width: `${px}px`,
                height: '24px',
                background: '#991B1B',
                minWidth: `${px}px`,
              }}
            />
            <div>
              <p
                style={{
                  fontFamily: 'Cinzel',
                  fontSize: '0.875rem',
                  color: '#E5E1D8',
                  margin: 0,
                }}
              >
                {name}
              </p>
              <p
                style={{
                  fontSize: '0.75rem',
                  color: '#A3A39C',
                  margin: '0.25rem 0 0 0',
                }}
              >
                {value}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
