// Slow, soft aurora along the top of the page, fading into the grey canvas.
import './AuroraBackground.css'

export default function AuroraBackground() {
  return (
    <div className="aurora-bg" aria-hidden="true">
      <div className="aurora-blob aurora-blob--purple" />
      <div className="aurora-blob aurora-blob--pink" />
      <div className="aurora-blob aurora-blob--peach" />
      <div className="aurora-blob aurora-blob--orange" />
    </div>
  )
}
