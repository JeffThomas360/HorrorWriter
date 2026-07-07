import '../src/styles/global.css';

/** @type { import('@storybook/react-vite').Preview } */
const preview = {
  parameters: {
    layout: 'centered',
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'dark',
      values: [
        {
          name: 'dark',
          value: 'var(--color-bg-primary)',
        },
        {
          name: 'surface',
          value: 'var(--color-bg-surface)',
        },
      ],
    },
    a11y: {
      test: 'todo'
    }
  },
  decorators: [
    (Story) => (
      <div style={{ background: '#121212', minHeight: '100vh', padding: '2rem', color: '#E5E1D8' }}>
        <Story />
      </div>
    ),
  ],
};

export default preview;