export default function Skeleton({ width = '100%', height = '20px', borderRadius = '4px', style = {} }) {
  return (
    <div
      className="skeleton-pulse"
      style={{
        width,
        height,
        borderRadius,
        background: 'rgba(231, 225, 209, 0.05)',
        ...style
      }}
    />
  )
}
