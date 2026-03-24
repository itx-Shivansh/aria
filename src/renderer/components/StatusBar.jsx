import React from "react";

function StatusBar({ text }) {
  return (
    <footer
      style={{
        padding: "10px 16px",
        fontSize: "0.85rem",
        borderTop: "1px solid rgba(148, 163, 184, 0.2)",
        color: "#94a3b8",
        background: "rgba(2, 6, 23, 0.6)"
      }}
    >
      Status: ARIA ready
    </footer>
  );
}

export default StatusBar;