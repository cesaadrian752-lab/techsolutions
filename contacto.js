const form = document.querySelector("#contact-form");
const status = document.querySelector("#form-status");
const button = form.querySelector("button");
const email = form.elements.namedItem("email");
const recipient = new URL(form.action);

function showStatus(state, message) {
  status.dataset.state = state;
  status.textContent = message;
}

function rejectEmail(message) {
  email.setAttribute("aria-invalid", "true");
  showStatus("error", message);
  email.focus();
}

async function dnsRecords(domain, type) {
  const url = new URL("https://dns.google/resolve");
  url.searchParams.set("name", domain);
  url.searchParams.set("type", type);
  url.searchParams.set("edns_client_subnet", "0.0.0.0/0");
  const response = await fetch(url, {
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error("No se pudo consultar DNS.");

  const { Status, TC, Answer = [] } = await response.json();
  if (Status === 3) return null;
  if (Status !== 0 || TC || !Array.isArray(Answer)) {
    throw new Error("La respuesta de DNS no está disponible.");
  }
  return Answer.filter(record => record.type === type);
}

async function hasMailDomain(domain) {
  const mx = await dnsRecords(domain, 15);
  if (!mx) return false;
  if (mx.length) {
    return mx.some(record => /^\d+\s+[a-z0-9][a-z0-9.-]*$/i.test(record.data));
  }

  // SMTP utiliza el propio dominio como servidor si no publica registros MX.
  const addresses = await Promise.allSettled([dnsRecords(domain, 1), dnsRecords(domain, 28)]);
  if (addresses.some(answer => answer.status === "fulfilled" && answer.value?.length)) {
    return true;
  }
  if (addresses.some(answer => answer.status === "rejected")) {
    throw new Error("No se pudieron verificar las direcciones del dominio.");
  }
  return false;
}

email.addEventListener("input", () => {
  if (email.hasAttribute("aria-invalid")) {
    email.removeAttribute("aria-invalid");
    showStatus("", "");
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (button.disabled) return;

  const data = new FormData(form);
  if (data.get("_honey")) return;

  const address = email.value;
  const [local, domain] = address.toLowerCase().split("@");
  const publicDomain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (!email.validity.valid || local.length > 64 || !/^[^.]+(?:\.[^.]+)*$/.test(local) || !publicDomain.test(domain)) {
    rejectEmail("Escribe un correo válido con un dominio completo, por ejemplo nombre@empresa.com.");
    return;
  }

  button.disabled = true;
  showStatus("pending", "Verificando el dominio del correo…");
  let sending = false;

  try {
    const validDomain = await hasMailDomain(domain);
    if (email.value !== address) {
      showStatus("error", "El correo cambió durante la verificación. Vuelve a enviar la solicitud.");
      return;
    }
    if (!validDomain) {
      rejectEmail("El dominio de este correo no existe o no está configurado para recibir mensajes.");
      return;
    }

    email.removeAttribute("aria-invalid");
    sending = true;
    showStatus("pending", "Enviando tu solicitud…");
    const endpoint = new URL("/ajax" + recipient.pathname, recipient.origin);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(data)),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok || ![true, "true"].includes(result.success)) {
      showStatus("error", "No se pudo entregar la solicitud. Puedes intentar de nuevo o escribirnos por correo.");
      return;
    }

    form.reset();
    showStatus("success", "Gracias. Tu solicitud se envió correctamente.");
  } catch {
    showStatus("error", sending
      ? "No pudimos confirmar el envío. Puedes intentar de nuevo o escribirnos por correo."
      : "No pudimos verificar el dominio del correo. Inténtalo de nuevo en unos momentos.");
  } finally {
    button.disabled = false;
  }
});

button.disabled = false;
