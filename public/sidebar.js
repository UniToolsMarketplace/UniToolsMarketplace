<script>
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("active");
}

// Caret-only toggles
document.querySelectorAll(".collapsible .caret").forEach(caret => {
  caret.addEventListener("click", function (e) {
    e.stopPropagation(); // don’t trigger the link
    const parent = this.closest(".collapsible");
    const nested = parent.nextElementSibling;
    this.classList.toggle("rotate");
    if (nested) {
      nested.style.display = nested.style.display === "block" ? "none" : "block";
    }
  });
});
</script>
