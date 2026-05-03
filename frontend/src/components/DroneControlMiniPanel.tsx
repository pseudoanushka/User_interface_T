import { getBaseUrl } from "../config";

const controls = [
  { label: "ARM", title: "Arm", action: "arm", className: "arm" },
  { label: "TAKEOFF", title: "Takeoff", action: "takeoff", className: "takeoff", event: "mission:start" },
  { label: "LAND", title: "Land", action: "land", className: "land", event: "mission:stop" },
  { label: "DISARM", title: "Disarm", action: "disarm", className: "disarm", event: "mission:stop" },
  { label: "KILL", title: "Kill switch", action: "kill", className: "kill" },
];

export function DroneControlMiniPanel() {
  const sendCommand = async (control: (typeof controls)[number]) => {
    try {
      await fetch(`${getBaseUrl()}/drone/control/${control.action}`, { method: "POST" });
      if (control.event) window.dispatchEvent(new Event(control.event));
    } catch {
      // Keep this panel quiet; the failsafe/status areas carry operator feedback.
    }
  };

  return (
    <div className="drone-mini-controls" aria-label="Drone quick controls">
      {controls.map((control) => (
        <button
          key={control.action}
          type="button"
          className={`drone-mini-btn ${control.className}`}
          title={control.title}
          onClick={() => sendCommand(control)}
        >
          {control.label}
        </button>
      ))}
    </div>
  );
}
