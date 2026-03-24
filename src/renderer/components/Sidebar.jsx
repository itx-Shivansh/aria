import React from "react";

const sidebarStyle = {
  padding: "20px 14px",
  borderRight: "1px solid rgba(148, 163, 184, 0.2)",
  background: "linear-gradient(180deg, rgba(2, 6, 23, 0.95), rgba(15, 23, 42, 0.88))",
  display: "flex",
  flexDirection: "column",
  gap: "12px"
};

const titleStyle = {
  margin: "0 0 6px",
  fontSize: "1.2rem",
  letterSpacing: "0.08em"
};

function Sidebar({ activeView, onChangeView }) {
  const actions = [
    { id: "chat", label: "Chat" },
    { id: "dashboard", label: "Dashboard" }
  ];

  return (
    <aside style={sidebarStyle}>
      <h1 style={titleStyle}>ARIA</h1>
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => onChangeView(action.id)}
          style={{
            border: "1px solid rgba(148, 163, 184, 0.35)",
            borderRadius: "10px",
            padding: "10px 12px",
            textAlign: "left",
            cursor: "pointer",
            color: activeView === action.id ? "#082f49" : "#e2e8f0",
            background:
              activeView === action.id
                ? "linear-gradient(145deg, #7dd3fc, #38bdf8)"
                : "linear-gradient(145deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.88))"
          }}
        >
          {action.label}
        </button>
      ))}
    </aside>
  );
}

export default Sidebar;