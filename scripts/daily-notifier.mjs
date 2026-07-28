export function buildDailyNotification({ pipelinePayload, feed, dashboardUrl }) {
  const recommendations = Array.isArray(feed?.recommendations) ? feed.recommendations : [];
  const sourceCounts = {};

  for (const recommendation of recommendations) {
    for (const source of recommendation.sources ?? []) {
      sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
    }
  }

  const failedSources = (pipelinePayload?.result?.sources ?? [])
    .filter((source) => source.status === "failed")
    .map((source) => source.source);
  const status = pipelinePayload?.status ?? pipelinePayload?.result?.status ?? "unknown";
  const papers = recommendations
    .filter((recommendation) => recommendation.title)
    .map((recommendation) => ({
      title: recommendation.title,
      url: recommendationUrl(recommendation)
    }));

  return {
    title: notificationTitle(status),
    status,
    runId: pipelinePayload?.result?.runId,
    recommendationCount: recommendations.length,
    sourceCounts,
    failedSources,
    papers,
    topPapers: papers.slice(0, 5),
    dashboardUrl
  };
}

function notificationTitle(status) {
  if (status === "complete") return "每日文献推荐已完成";
  if (status === "complete_with_warnings") return "每日文献推荐已完成（有警告）";
  if (status === "failed") return "每日文献推荐失败";
  return "每日文献推荐部分完成";
}

export async function sendDailyNotification({
  notification,
  env,
  fetchImpl = fetch,
  createTransport
}) {
  const attempts = [];
  const wecomWebhookUrl = env.WECOM_BOT_WEBHOOK_URL?.trim();

  if (wecomWebhookUrl) {
    try {
      await sendWecomNotification({ notification, webhookUrl: wecomWebhookUrl, fetchImpl });
      return { status: "sent", channel: "wecom", attempts: ["wecom"] };
    } catch (error) {
      attempts.push({ channel: "wecom", error: safeErrorMessage(error) });
    }
  }

  const emailConfig = readEmailConfig(env);
  if (emailConfig) {
    try {
      await sendEmailNotification({ notification, config: emailConfig, createTransport });
      return {
        status: "sent",
        channel: "email",
        attempts: [...attempts.map((attempt) => attempt.channel), "email"],
        fallbackFrom: attempts[0]?.channel
      };
    } catch (error) {
      attempts.push({ channel: "email", error: safeErrorMessage(error) });
    }
  }

  if (attempts.length === 0) {
    return {
      status: "skipped",
      channel: "none",
      reason: "No WeCom webhook or complete SMTP configuration"
    };
  }

  return { status: "failed", channel: "none", attempts };
}

async function sendWecomNotification({ notification, webhookUrl, fetchImpl }) {
  const response = await fetchImpl(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msgtype: "markdown",
      markdown: { content: toWecomMarkdown(notification) }
    })
  });

  if (!response.ok) {
    throw new Error(`WeCom webhook returned HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (payload.errcode !== 0) {
    throw new Error(`WeCom webhook returned error code ${String(payload.errcode)}`);
  }
}

async function sendEmailNotification({ notification, config, createTransport }) {
  const transportFactory = createTransport ?? (await import("nodemailer")).default.createTransport;
  const transporter = transportFactory({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.user && config.pass
      ? { auth: { user: config.user, pass: config.pass } }
      : {})
  });

  await transporter.sendMail({
    from: config.from,
    to: config.to,
    subject: notification.title,
    text: toPlainText(notification),
    html: toHtml(notification)
  });
}

function readEmailConfig(env) {
  const host = env.NOTIFICATION_SMTP_HOST?.trim();
  const from = env.NOTIFICATION_EMAIL_FROM?.trim();
  const to = env.NOTIFICATION_EMAIL_TO?.trim();
  if (!host || !from || !to) return null;

  const port = parsePositiveInteger(env.NOTIFICATION_SMTP_PORT, 465);
  return {
    host,
    port,
    secure: parseBoolean(env.NOTIFICATION_SMTP_SECURE, port === 465),
    user: env.NOTIFICATION_SMTP_USER?.trim(),
    pass: env.NOTIFICATION_SMTP_PASS?.trim(),
    from,
    to
  };
}

function toWecomMarkdown(notification) {
  const lines = [
    `### ${notification.title}`,
    `> 推荐数量：<font color="info">${notification.recommendationCount}</font>`,
    `> 来源：${formatSourceCounts(notification.sourceCounts)}`,
    `> 状态：${notification.status}`
  ];
  if (notification.failedSources.length > 0) {
    lines.push(`> 失败来源：<font color="warning">${notification.failedSources.join(", ")}</font>`);
  }
  if (notification.topPapers.length > 0) {
    lines.push(
      "",
      "**Top 5**",
      ...notification.topPapers.map((paper, index) =>
        `${index + 1}. ${paper.url ? `[${paper.title}](${paper.url})` : paper.title}`
      )
    );
  }
  if (isPublicDashboardUrl(notification.dashboardUrl)) {
    lines.push("", `[打开推荐页面](${notification.dashboardUrl})`);
  }
  return lines.join("\n");
}

function toPlainText(notification) {
  return [
    notification.title,
    `推荐数量：${notification.recommendationCount}`,
    `来源：${formatSourceCounts(notification.sourceCounts)}`,
    `状态：${notification.status}`,
    notification.failedSources.length > 0 ? `失败来源：${notification.failedSources.join(", ")}` : "",
    "",
    ...notification.papers.flatMap((paper, index) => [
      `${index + 1}. ${paper.title}`,
      ...(paper.url ? [`   ${paper.url}`] : [])
    ]),
    ...(isPublicDashboardUrl(notification.dashboardUrl)
      ? ["", `打开推荐页面：${notification.dashboardUrl}`]
      : [])
  ]
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n");
}

function toHtml(notification) {
  const paperLinks = notification.papers
    .map((paper) => paper.url
      ? `<li><a href="${escapeHtml(paper.url)}">${escapeHtml(paper.title)}</a></li>`
      : `<li>${escapeHtml(paper.title)}</li>`)
    .join("");
  const failedSources = notification.failedSources.length > 0
    ? `<p><strong>失败来源：</strong>${escapeHtml(notification.failedSources.join(", "))}</p>`
    : "";

  return [
    `<h2>${escapeHtml(notification.title)}</h2>`,
    `<p><strong>推荐数量：</strong>${notification.recommendationCount}</p>`,
    `<p><strong>来源：</strong>${escapeHtml(formatSourceCounts(notification.sourceCounts))}</p>`,
    `<p><strong>状态：</strong>${escapeHtml(notification.status)}</p>`,
    failedSources,
    paperLinks ? `<h3>推荐列表</h3><ol>${paperLinks}</ol>` : "",
    isPublicDashboardUrl(notification.dashboardUrl)
      ? `<p><a href="${escapeHtml(notification.dashboardUrl)}">打开推荐页面</a></p>`
      : ""
  ].join("");
}

function recommendationUrl(recommendation) {
  const identifiers = recommendation.identifiers ?? {};
  if (identifiers.doi) return `https://doi.org/${encodeURI(identifiers.doi)}`;
  if (identifiers.pmid) return `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(identifiers.pmid)}/`;
  if (identifiers.arxivId) return `https://arxiv.org/abs/${encodeURIComponent(identifiers.arxivId)}`;
  if (identifiers.bioRxivId) return `https://www.biorxiv.org/content/${encodeURI(identifiers.bioRxivId)}`;
  return null;
}

function isPublicDashboardUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "::1" || hostname.endsWith(".local")) return false;
    const octets = hostname.split(".").map(Number);
    if (octets.length === 4 && octets.every((octet) =>
      Number.isInteger(octet) && octet >= 0 && octet <= 255)) {
      return !(
        octets[0] === 10 ||
        octets[0] === 127 ||
        (octets[0] === 169 && octets[1] === 254) ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168)
      );
    }
    return true;
  } catch {
    return false;
  }
}

function formatSourceCounts(sourceCounts) {
  const entries = Object.entries(sourceCounts);
  return entries.length > 0
    ? entries.map(([source, count]) => `${source} ${count}`).join(" / ")
    : "无";
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === "") return fallback;
  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}

function safeErrorMessage(error) {
  return error instanceof Error ? error.message : "Unknown notification error";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
