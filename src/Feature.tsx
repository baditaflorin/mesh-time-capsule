import { useEffect, useMemo, useState } from "react";
import {
  createClockSync,
  MeshNameInput,
  useCommitRevealHook,
  useNamedPeer,
  type MeshConfig,
  type YRoom,
} from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };
type Capsule = { text: string; unlockAt: number; label?: string };

const DURATIONS: { label: string; ms: number }[] = [
  { label: "1 sec", ms: 1_000 },
  { label: "1 min", ms: 60_000 },
  { label: "5 min", ms: 5 * 60_000 },
  { label: "1 hour", ms: 60 * 60_000 },
  { label: "1 day", ms: 24 * 60 * 60_000 },
];

function fmtCountdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export function Feature({ room, config }: Props) {
  if (!room) {
    return (
      <div className="capsule-screen">
        <h1>time capsule</h1>
        <p className="capsule-status">Connecting…</p>
      </div>
    );
  }
  return <Body room={room} config={config} />;
}

function Body({ room, config }: { room: YRoom; config: MeshConfig }) {
  const { name, setName, nameOf } = useNamedPeer(config, room);
  const cr = useCommitRevealHook<Capsule>(room, config.storagePrefix, "capsules");
  const clock = useMemo(() => (room ? createClockSync(room.provider) : null), [room]);
  useEffect(() => () => clock?.destroy(), [clock]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(clock ? clock.meshNow() : Date.now()), 500);
    return () => clearInterval(id);
  }, [clock]);

  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [duration, setDuration] = useState<number>(1_000);
  const [, rerender] = useState(0);

  useEffect(() => {
    const unlocks = room.doc.getMap<number>("capsule-unlocks");
    const cb = () => rerender((n) => n + 1);
    unlocks.observe(cb);
    return () => unlocks.unobserve(cb);
  }, [room]);

  const unlocks = room.doc.getMap<number>("capsule-unlocks");
  const myUnlockAt = unlocks.get(room.peerId) ?? 0;
  const canRevealMine = cr.status === "committed" && now >= myUnlockAt && myUnlockAt > 0;

  const seal = async () => {
    const t = text.trim();
    if (!t) return;
    const unlockAt = now + duration;
    await cr.commit({ text: t, unlockAt, label: label.trim() || undefined });
    room.doc.getMap<number>("capsule-unlocks").set(room.peerId, unlockAt);
    setText("");
    setLabel("");
  };

  const rows = Object.values(cr.entries).sort((a, b) => a.peerId.localeCompare(b.peerId));
  const present = room.peerCount + 1;

  return (
    <div className="capsule-screen">
      <header className="capsule-header">
        <h1>time capsule</h1>
        <p className="capsule-status">
          {present} {present === 1 ? "peer" : "peers"} · one capsule per peer
        </p>
      </header>

      <MeshNameInput
        value={name}
        onChange={setName}
        placeholder="your name"
        maxLength={48}
        className="capsule-name"
      />

      {cr.status === "idle" && (
        <div className="capsule-form">
          <textarea
            className="capsule-text"
            placeholder="write your note…"
            maxLength={280}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <input
            className="capsule-label"
            placeholder="label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={48}
          />
          <div className="capsule-durations" role="group" aria-label="unlock in">
            {DURATIONS.map((d) => (
              <button
                key={d.label}
                type="button"
                aria-label={d.label}
                className={duration === d.ms ? "is-selected" : ""}
                onClick={() => setDuration(d.ms)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <button type="button" className="capsule-seal" onClick={seal} disabled={!text.trim()}>
            Seal it
          </button>
        </div>
      )}

      {cr.status === "committed" && (
        <div className="capsule-mine">
          <p>your capsule is sealed · unlocks in {fmtCountdown(myUnlockAt - now)}</p>
          <button
            type="button"
            className="capsule-reveal-mine"
            aria-label="reveal mine"
            disabled={!canRevealMine}
            onClick={() => cr.reveal()}
          >
            reveal mine
          </button>
        </div>
      )}

      {cr.status === "revealed" && cr.myReveal && (
        <div className="capsule-mine">
          <p>your revealed capsule:</p>
          <p className="capsule-mine-text">{cr.myReveal.text}</p>
        </div>
      )}

      <ul className="capsule-list">
        {rows.map((row) => {
          const u = unlocks.get(row.peerId) ?? 0;
          return (
            <li key={row.peerId} className="capsule-row" data-peer-id={row.peerId}>
              <header>{nameOf(row.peerId)}</header>
              {row.reveal ? (
                <p>revealed: {row.reveal.payload.text}</p>
              ) : (
                <p>sealed · unlocks at {u ? fmtTime(u) : "…"}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
