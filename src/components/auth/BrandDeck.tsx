import { motion } from "motion/react";
import { Fingerprint, KeyRound, ScanFace } from "lucide-react";
import secureLockerLogo from "../../assets/new-securelocker-logo.png";

const systemStats = [
  { label: "Identity", value: "Protected" },
  { label: "Access", value: "Locked" },
  { label: "Device", value: "Trusted" },
];

export function BrandDeck() {
  return (
    <aside className="brand-deck" aria-label="SecureLocker product identity">
      <div className="brand-deck__topline">
        <div className="brand-mark" aria-hidden="true">
          <img src={secureLockerLogo} alt="" width="48" height="48" decoding="async" />
        </div>
        <div>
          <strong>SecureLocker</strong>
          <span>Windows security access</span>
        </div>
      </div>

      <div className="brand-deck__core" aria-hidden="true">
        <motion.div
          animate={{ rotate: 360 }}
          className="orbital orbital--outer"
          transition={{ duration: 34, ease: "linear", repeat: Infinity }}
        />
        <motion.div
          animate={{ rotate: -360 }}
          className="orbital orbital--inner"
          transition={{ duration: 22, ease: "linear", repeat: Infinity }}
        />
        <div className="brand-deck__shield">
          <Fingerprint />
        </div>
      </div>

      <div className="brand-deck__copy">
        <span className="eyebrow">Encrypted identity gate</span>
        <h2>Protected access for Windows workstations.</h2>
        <p>Enter through a hardened identity layer built for encrypted desktop environments.</p>
      </div>

      <div className="brand-deck__signals" aria-label="SecureLocker protection signals">
        {systemStats.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      <div className="brand-deck__rail" aria-hidden="true">
        <span>
          <ScanFace />
          identity guard
        </span>
        <span>
          <KeyRound />
          credential shield
        </span>
      </div>
    </aside>
  );
}
