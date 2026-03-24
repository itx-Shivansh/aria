import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

function WhatsAppSetup({ ariaAPI }) {
  const [open, setOpen] = useState(false);
  const [statusText, setStatusText] = useState("Checking WhatsApp status...");
  const [isConnecting, setIsConnecting] = useState(false);
  const [qrImage, setQrImage] = useState("");

  const canUseWhatsAppAPI = useMemo(() => {
    return (
      ariaAPI &&
      typeof ariaAPI.whatsappInit === "function" &&
      typeof ariaAPI.whatsappStatus === "function"
    );
  }, [ariaAPI]);

  useEffect(() => {
    if (!canUseWhatsAppAPI) {
      return;
    }

    let disposed = false;

    async function checkStatus() {
      try {
        const status = await ariaAPI.whatsappStatus();
        if (disposed) {
          return;
        }

        if (status?.isReady) {
          setOpen(false);
          setStatusText("WhatsApp Connected");
          return;
        }

        setOpen(true);
        if (status?.isInitializing) {
          setStatusText("Waiting for WhatsApp session...");
          setIsConnecting(true);
        } else {
          setStatusText("WhatsApp is not connected yet.");
          setIsConnecting(false);
        }
      } catch {
        if (!disposed) {
          setOpen(true);
          setStatusText("Unable to check WhatsApp status.");
        }
      }
    }

    const stopQR =
      typeof ariaAPI.onWhatsappQR === "function"
        ? ariaAPI.onWhatsappQR(async (qr) => {
            try {
              const nextQrImage = await QRCode.toDataURL(qr, {
                width: 280,
                margin: 1
              });
              if (!disposed) {
                setQrImage(nextQrImage);
                setStatusText("Scan this QR with your phone's WhatsApp");
              }
            } catch {
              if (!disposed) {
                setStatusText("QR received, but rendering failed.");
              }
            }
          })
        : null;

    const stopReady =
      typeof ariaAPI.onWhatsappReady === "function"
        ? ariaAPI.onWhatsappReady(() => {
            if (disposed) {
              return;
            }
            setStatusText("✅ WhatsApp Connected!");
            setIsConnecting(false);
            setQrImage("");
            setTimeout(() => {
              if (!disposed) {
                setOpen(false);
              }
            }, 800);
          })
        : null;

    checkStatus();

    return () => {
      disposed = true;
      if (typeof stopQR === "function") {
        stopQR();
      }
      if (typeof stopReady === "function") {
        stopReady();
      }
    };
  }, [ariaAPI, canUseWhatsAppAPI]);

  async function connectWhatsApp() {
    if (!canUseWhatsAppAPI) {
      setOpen(true);
      setStatusText("WhatsApp bridge is unavailable.");
      return;
    }

    setOpen(true);
    setIsConnecting(true);
    setStatusText("Initializing WhatsApp... Please wait.");

    try {
      await ariaAPI.whatsappInit();
      setStatusText("Waiting for QR code...");
    } catch (error) {
      setIsConnecting(false);
      setStatusText(`Initialization failed: ${String(error?.message || error)}`);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="wa-modal-overlay" role="dialog" aria-modal="true" aria-label="WhatsApp setup">
      <div className="wa-modal">
        <h3>Connect WhatsApp</h3>
        <p>{statusText}</p>

        {qrImage ? (
          <img src={qrImage} alt="WhatsApp QR code" className="wa-qr" />
        ) : (
          <div className="wa-qr-placeholder">QR will appear here after initialization.</div>
        )}

        <div className="wa-actions">
          <button type="button" onClick={connectWhatsApp} disabled={isConnecting}>
            {isConnecting ? "Connecting..." : "Connect WhatsApp"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default WhatsAppSetup;
