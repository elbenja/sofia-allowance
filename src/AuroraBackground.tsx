// Slow, soft aurora along the top of the page, fading into the grey canvas.
// Parent mode crossfades to a cooler mint-teal aurora.
import './AuroraBackground.css'

export default function AuroraBackground({ parent }: { parent: boolean }) {
  return (
    <div className={`aurora-bg${parent ? ' aurora-bg--parent' : ''}`} aria-hidden="true">
      <div className="aurora-layer">
        <div className="aurora-blob aurora-blob--purple" />
        <div className="aurora-blob aurora-blob--pink" />
        <div className="aurora-blob aurora-blob--peach" />
        <div className="aurora-blob aurora-blob--orange" />
      </div>
      <div className="aurora-layer aurora-layer--parent">
        <div className="aurora-blob aurora-blob--mint" />
        <div className="aurora-blob aurora-blob--aqua" />
        <div className="aurora-blob aurora-blob--deep" />
        <div className="aurora-blob aurora-blob--teal" />
      </div>
    </div>
  )
}
