document.addEventListener("DOMContentLoaded", () => {
  // Only show popup if not accepted before
  if (!localStorage.getItem("popupAccepted")) {
    showPopup();
  }
});

function showPopup() {
  // Overlay
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.backgroundColor = "rgba(0,0,0,0.6)";
  overlay.style.display = "flex";
  overlay.style.justifyContent = "center";
  overlay.style.alignItems = "center";
  overlay.style.zIndex = "9999";
  overlay.style.opacity = "0";
  overlay.style.transition = "opacity 0.3s ease";

  // Popup card
  const popup = document.createElement("div");
  popup.style.background = "#fff";
  popup.style.padding = "30px 20px";
  popup.style.borderRadius = "12px";
  popup.style.maxWidth = "420px";
  popup.style.width = "90%";
  popup.style.boxShadow = "0 8px 24px rgba(0,0,0,0.2)";
  popup.style.textAlign = "center";
  popup.style.fontFamily = "Arial, sans-serif";
  popup.style.transform = "scale(0.9)";
  popup.style.transition = "transform 0.3s ease";

  popup.innerHTML = `
    <h2 style="margin-bottom: 15px; font-size: 1.5rem; color:#333;">
      Welcome to UniTools Marketplace
    </h2>
    <p style="margin-bottom: 20px; font-size: 1rem; color:#555;">
      Please accept to continue browsing the website.
    </p>
    <button id="acceptBtn" 
      style="
        background: #007BFF;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        font-size: 1rem;
        cursor: pointer;
        transition: background 0.2s ease;
      ">
      Accept
    </button>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  // Fade-in animation
  requestAnimationFrame(() => {
    overlay.style.opacity = "1";
    popup.style.transform = "scale(1)";
  });

  // Button handler
  document.getElementById("acceptBtn").addEventListener("click", () => {
    localStorage.setItem("popupAccepted", "true");
    overlay.style.opacity = "0";
    popup.style.transform = "scale(0.9)";
    setTimeout(() => document.body.removeChild(overlay), 300); // remove after animation
  });

  // Hover effect for button
  document.getElementById("acceptBtn").addEventListener("mouseover", (e) => {
    e.target.style.background = "#0056b3";
  });
  document.getElementById("acceptBtn").addEventListener("mouseout", (e) => {
    e.target.style.background = "#007BFF";
  });
}
