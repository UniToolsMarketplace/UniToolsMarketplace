document.addEventListener("DOMContentLoaded", () => {
  // Check if the user has already accepted
  if (!localStorage.getItem("popupAccepted")) {
    showPopup();
  }
});

function showPopup() {
  // Create overlay
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.top = 0;
  overlay.style.left = 0;
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.backgroundColor = "rgba(0,0,0,0.6)";
  overlay.style.display = "flex";
  overlay.style.justifyContent = "center";
  overlay.style.alignItems = "center";
  overlay.style.zIndex = 9999;

  // Create popup box
  const popup = document.createElement("div");
  popup.style.background = "#fff";
  popup.style.padding = "20px";
  popup.style.borderRadius = "10px";
  popup.style.maxWidth = "400px";
  popup.style.textAlign = "center";
  popup.innerHTML = `
    <h2>Welcome to UniTools Marketplace</h2>
    <p>Please accept to continue browsing the website.</p>
    <button id="acceptBtn">Accept</button>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  document.getElementById("acceptBtn").addEventListener("click", () => {
    localStorage.setItem("popupAccepted", "true"); // save acceptance
    document.body.removeChild(overlay); // close popup
  });
}
