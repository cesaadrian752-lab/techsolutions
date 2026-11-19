const form = document.querySelector("#contact-form");
const status = document.querySelector("#form-status");
const button = form.querySelector("button");
const recipient = new URL(form.action);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (button.disabled) return;

  const data = new FormData(form);
  if (data.get("_honey")) return;

  button.disabled = true;
  status.dataset.state = "pending";
  status.textContent = "Enviando tu solicitud…";

  try {
    const endpoint = new URL("/ajax" + recipient.pathname, recipient.origin);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(data)),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok || ![true, "true"].includes(result.success)) {
      status.textContent = "No se pudo entregar la solicitud. Puedes intentar de nuevo o escribirnos por correo.";
      status.dataset.state = "error";
      return;
    }

    form.reset();
    status.textContent = "Gracias. Tu solicitud se envió correctamente.";
    status.dataset.state = "success";
  } catch {
    status.textContent = "No pudimos confirmar el envío. Puedes intentar de nuevo o escribirnos por correo.";
    status.dataset.state = "error";
  } finally {
    button.disabled = false;
  }
});
