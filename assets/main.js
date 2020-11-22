"use strict";

const hour = 60 * 60 * 1000
const day = 60 * 60 * 24 * 1000;
const PALLET = ["#66bb6a", "#7e57c2", "#ff7043", "#26c6da", "#9ccc65", "#5c6bc0", "#26a69a", "#d4e157", "#42a5f5", "#29b6f6", "#ffa726", "#ffca28", "#ef5350", "#ec407a", "#ab47bc"]
const daysOffset = 30
let $spinner;
let $chartCard;
let $chartContainer;
let $tableContainer;
let accountsSDK;
let credentials;
let $loader;
let $loaderText;
let auth;
let api;
let webApi;

document.addEventListener("DOMContentLoaded", function main() {
  $loader = document.getElementById("loader")
  $loaderText = document.getElementById("loader-text")
  $spinner = document.getElementById("spinner")
  $chartCard = document.getElementById("chart-card")
  $chartContainer = document.getElementById("chart-container")
  $tableContainer = document.getElementById("table-card")

  if (!$loader) {
    throw new Error("`loader` can't be empty")
  }

  ok($loader, "`loader` can't be empty")
  ok($loaderText, "`loader` can't be empty")
  ok($spinner, "`spinner` can't be empty")
  ok($chartCard, "Hm, can't find card with chart")
  ok($chartContainer, "Hm, can't find chart container")
  ok($tableContainer, "Hm, can't find element with id `table-card`")

  accountsSDK = AccountsSDK.init({
    client_id: "64da6a018ac5c8ad07a96cf8e0dd8b35",
    onIdentityFetched: handleIdentityFetched
  })

  function handleIdentityFetched(error, response) {
    if (error) {
      return showLoginScreen()
    }

    credentials = parseTokenInfo(response)
    auth = new Auth(credentials.access_token, credentials.expires_at)
    api = new RestApi(auth)
    webApi = new WebApi(auth)

    displayUsageData(handleProgress).catch(handleError)
  }
})

function handleSignIn() {
  if (accountsSDK) {
    accountsSDK.openPopup()
  }
}

function handleRetry() {
  displayUsageData(handleProgress).catch(handleError)
}

function handleProgress(progressMessage) {
  $loaderText.innerText = progressMessage
}

function handleError(err) {
  $spinner.style.display = "none"
  $loaderText.innerText = err
}

function showLoginScreen() {
  showScreen("screen--login")
}

async function displayUsageData(onProgress) {
  showScreen("screen--loader")

  ok(typeof onProgress === "function", "`onProgress` should be a function")

  // init progress
  onProgress("Step 1 of 3: loading groups")

  const groups = await api.getGroups()

  onProgress("Step 2 of 3: loading canned responses")

  const cannedResponses = await api.getCannedResponses(groups.map(v => v.id))
  const to = endOfDay(new Date())
  const from = addDays(to, -daysOffset)
  const usages = await getUsages(cannedResponses, from, to, function (progress) {
    onProgress(`Step 3 of 3: checking chats for last ${daysOffset} days (${progress}%)`)
  })

  if (usages.getSize() === 0) {
    return showScreen("screen--no-usage-data")
  }

  // get chart data
  const chartData = new ChartData(usages.toJSON(), from, to, cannedResponses)

  // render chart
  ChartController($chartContainer, chartData)

  // render table
  renderTable($tableContainer, getTableData(cannedResponses, usages))

  // show
  showScreen("screen--app")
}

function showScreen(screenName) {
  const screens = document.querySelectorAll(".screen")

  for (let i = 0; i < screens.length; i++) {
    if (screens[i].classList.contains(screenName)) {
      screens[i].classList.remove("hidden")
    }
    else {
      screens[i].classList.add("hidden")
    }
  }
}

function ok(value, message) {
  if (!value) {
    throw new Error(message)
  }
}

class Auth {
  constructor(accessToken, expiredAt) {
    this.accessToken = accessToken;
    this.expiredAt = expiredAt;
    this.safetyWindow = 1000 * 60 * 5; // 5m 
  }

  getAccessToken() {
    if (this.expiredAt < Date.now() + this.safetyWindow) {
      throw new Error("Access token has expired");
    }

    return this.accessToken;
  }

  getRegion() {
    return this.accessToken.substr(0, 3);
  }
}

class RestApi {
  constructor(auth) {
    this.auth = auth;
  }

  getGroups() {
    return this.perform("groups", "GET").then(groups => parseGroups(groups));
  }

  getCannedResponses(groupIds) {
    const group = encodeURIComponent(groupIds.join(","));

    return this.perform(`canned_responses?group=${group}`, "GET").then(rest => parseCannedResponses(rest));
  }

  perform(path, method, body) {
    const region = this.auth.getRegion()
    const accessToken = this.auth.getAccessToken()
    const url = `https://us-central1-canned-response-usage.cloudfunctions.net/proxy/${path}`;
    const headers = {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-API-Version": "2",
      "X-Region": region
    }
    const init = {
      headers,
      method,
      body: JSON.stringify(body)
    }

    return fetch(url, init)
      .then(parseJsonResponse)
  }
}

class WebApi {
  constructor(auth) {
    this.auth = auth;
  }

  listArchives(body) {
    return this.perform("v3.2/agent/action/list_archives", "POST", body).then(resp => parseArchives(resp));
  }

  perform(path, method, body) {
    const region = this.auth.getRegion()
    const accessToken = this.auth.getAccessToken()
    const url = `https://api.livechatinc.com/${path}`;
    const headers = {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Region": region
    }
    const init = {
      headers,
      method,
      body: JSON.stringify(body)
    }

    return fetch(url, init).then(parseJsonResponse)
  }
}

class Usages {
  constructor() {
    this.usages = new Map()
  }

  mark(cannedResponseId, date) {
    let usage = this.usages.get(cannedResponseId)

    if (!usage) {
      this.usages.set(cannedResponseId, usage = new Usage())
    }

    usage.mark(date)
  }

  getUsage(cannedResponseId) {
    return this.usages.get(cannedResponseId)
  }

  toJSON() {
    return Array.from(this.usages).map(function (item) {
      const cannedResponseId = item[0]
      const usage = item[1].toJSON()

      return [cannedResponseId, usage]
    })
  }

  getSize() {
    return this.usages.size
  }
}

class Usage {
  constructor() {
    this.total = 0
    this.dailyUsage = new Map();
    this.hourlyUsage = new Map();
  }

  mark(date) {
    const day = getRoundedDownDay(date)
    const hour = getRoundedDownHour(date)

    this.total++
    this.dailyUsage.set(day, (this.dailyUsage.get(day) || 0) + 1)
    this.hourlyUsage.set(hour, (this.hourlyUsage.get(hour) || 0) + 1)
  }

  toJSON() {
    return {
      total: this.total,
      daily: Array.from(this.dailyUsage),
      hourly: Array.from(this.hourlyUsage),
    }
  }
}

class ChartData {
  /** @param {Array} usages */
  constructor(usages, start, end, cannedResponses) {
    /**
     * @typedef {Object} Usage
     * @property {number} total
     * @property {[number, number][]} daily
     * @property {[number, number][]} hourly - Indicates whether the Power component is present.
     */

    /**
     * @type {[number, Usage][]}
     */
    this.usages = usages.concat()
      .sort(function (a, b) {
        return b[1].total - a[1].total
      })
      .slice(0, 10)

    /** @type {Date} */
    this.start = start

    /** @type {Date} */
    this.end = end

    /** @type {Map<number, object>} */
    this.byIds = new Map(cannedResponses.map(v => [v.id, v]))
  }

  getOverviewColumns() {
    let curr = getRoundedDownDay(this.start)
    const end = getRoundedDownDay(this.end)
    const xColumn = ["x"]
    const yColumns = this.usages.map(function (usage) {
      return ["y" + usage[0]]
    })
    const dailyUsages = this.usages.map(function (usage) {
      return usage[1].daily.concat().sort(function (a, b) {
        return a[0] - b[0]
      })
    })

    while (curr <= end) {
      xColumn.push(curr)

      for (let i = 0; i < dailyUsages.length; i++) {
        const dailyUsage = dailyUsages[i]
        const yColumn = yColumns[i]

        if (dailyUsage.length > 0 && dailyUsage[0][0] === curr) {
          yColumn.push(dailyUsage[0][1])

          dailyUsage.shift()
        }
        else {
          yColumn.push(0)
        }
      }

      curr += day
    }

    return [xColumn].concat(yColumns)
  }

  getZoomedColumns(date) {
    let curr = Math.max(addDays(date, -1).getTime(), this.start.getTime())
    const end = Math.min(addDays(date, 1).getTime(), this.end.getTime())
    const xColumn = ["x"]
    const yColumns = this.usages.map(function (usage) {
      return ["y" + usage[0]]
    })
    const hourlyUsages = this.usages.map(function (usage) {
      return usage[1].hourly
        .concat()
        .sort(function (a, b) {
          return a[0] - b[0]
        })
        .filter(function (v) {
          return curr <= v[0] && v[0] <= end
        })
    })

    while (curr <= end) {
      xColumn.push(curr)

      for (let i = 0; i < hourlyUsages.length; i++) {
        const hourlyUsage = hourlyUsages[i]
        const yColumn = yColumns[i]

        if (hourlyUsage.length > 0 && hourlyUsage[0][0] === curr) {
          yColumn.push(hourlyUsage[0][1])

          hourlyUsage.shift()
        }
        else {
          yColumn.push(0)
        }
      }

      curr += hour
    }

    console.log([xColumn].concat(yColumns))

    return [xColumn].concat(yColumns)
  }

  getTypes() {
    const types = {
      x: "x"
    }

    this.usages.forEach(function (usage) {
      types["y" + usage[0]] = "line"
    })

    return types
  }

  getNames() {
    const names = {}

    this.usages.forEach((usage) => {
      const id = usage[0]
      const canned = this.byIds.get(id)
      const name = canned ? canned.tags.map(t => `#${t}`).join(" ") : "Canned with id " + id

      names["y" + usage[0]] = name
    })

    return names
  }

  getColors() {
    const colors = {}

    this.usages.forEach(function (usage, index) {
      colors["y" + usage[0]] = PALLET[index % PALLET.length]
    })

    return colors
  }
}

/**
 * Parsers
 *
 * @private
 */

function parseTokenInfo(data) {
  return {
    access_token: String(data.access_token),
    expires_at: Date.now() + Number(data.expires_in) * 1000
  }
}

function parseJsonResponse(response) {
  if (response.ok) {
    return response.text().then(function (text) {
      try {
        return JSON.parse(text);
      }
      catch (err) {
        throw err;
      }
    });
  }
  else {
    return response.text().then(function (text) {
      throw new Error(text);
    });
  }
}

function parseGroups(groups) {
  return Array.isArray(groups) ? groups.map(g => parseGroup(g)) : [];
}

function parseGroup(group) {
  var _a;
  return {
    id: Number(group === null || group === void 0 ? void 0 : group.id),
    name: String((_a = group === null || group === void 0 ? void 0 : group.name) !== null && _a !== void 0 ? _a : ""),
  };
}

function parseCannedResponses(cannedResponses) {
  return Array.isArray(cannedResponses) ? cannedResponses.map(v => parseCannedResponse(v)) : [];
}

function parseCannedResponse(cannedResponse) {
  var _a;
  const tags = Array.isArray(cannedResponse === null || cannedResponse === void 0 ? void 0 : cannedResponse.tags)
    ? cannedResponse.tags.map((tag) => String(tag !== null && tag !== void 0 ? tag : ""))
    : [];
  return {
    id: Number(cannedResponse === null || cannedResponse === void 0 ? void 0 : cannedResponse.id),
    groupId: Number(cannedResponse === null || cannedResponse === void 0 ? void 0 : cannedResponse.group),
    modificationDate: Number((_a = cannedResponse === null || cannedResponse === void 0 ? void 0 : cannedResponse.modification_date) !== null && _a !== void 0 ? _a : 0) * 1000,
    tags,
    text: String(cannedResponse === null || cannedResponse === void 0 ? void 0 : cannedResponse.text),
  };
}

function parseArchives(archives) {
  var _a;
  return {
    chats: parseChats(archives === null || archives === void 0 ? void 0 : archives.chats),
    foundChats: Number((_a = archives === null || archives === void 0 ? void 0 : archives.found_chats) !== null && _a !== void 0 ? _a : 0),
    nextPageId: (archives === null || archives === void 0 ? void 0 : archives.next_page_id) ? String(archives.next_page_id) : void 0
  };
}

function parseChats(chats) {
  return Array.isArray(chats) ? chats.map(c => parseChat(c)) : [];
}

function parseChat(chat) {
  return {
    id: String(chat === null || chat === void 0 ? void 0 : chat.id),
    thread: parseThread(chat.thread),
    users: parseUsers(chat.users)
  };
}

function parseThread(thread) {
  return {
    id: String(thread.id),
    events: parseEvents(thread === null || thread === void 0 ? void 0 : thread.events)
  };
}

function parseEvents(events) {
  return Array.isArray(events) ? events.map(e => parseEvent(e)) : [];
}

function parseEvent(event) {
  var _a;
  return {
    id: String(event === null || event === void 0 ? void 0 : event.id),
    type: String(event === null || event === void 0 ? void 0 : event.type),
    text: String(event && event.text || "").trim(),
    recipients: String(event === null || event === void 0 ? void 0 : event.recipients),
    authorId: (event === null || event === void 0 ? void 0 : event.author_id) ? String(event === null || event === void 0 ? void 0 : event.author_id) : void 0,
    createdAt: String((_a = event.created_at) !== null && _a !== void 0 ? _a : ""),
  };
}

function parseUsers(users) {
  if (!Array.isArray(users)) {
    return []
  }

  return users.map(u => parseUser(u))
}

function parseUser(user) {
  const type = user.type

  if (type !== "agent" && type !== "customer") {
    console.warn("Unsupported type of user", user)
  }

  return {
    id: String(user.id),
    name: String(user.name),
    type: type,
  }
}

function getGroupedCannedResponse(cannedResponses) {
  const hash = new Map()

  for (let i = 0; i < cannedResponses.length; i++) {
    const cannedResponse = cannedResponses[i];
    const normalizedText = getNormalizedText(cannedResponse.text)

    if (normalizedText.length > 0) {
      hash.set(normalizedText, cannedResponse)
    }
    else {
      console.warn("canned response has empty text", cannedResponse)
    }
  }

  return hash
}

async function getUsages(cannedResponses, from, to, onProgress) {
  ok(Array.isArray(cannedResponses), "`hashedCannedResponses` should be a Map")
  ok(from, "`from` date parameter is missed")
  ok(to, "`to` date parameter is missed")
  ok(webApi, "`webApi` is undefined")

  if (onProgress) {
    ok(typeof onProgress === "function", "`onProgress` parameter should be a function")
  }
  else {
    onProgress = function () { }
  }

  const hashedCannedResponses = getGroupedCannedResponse(cannedResponses)
  const usages = new Usages()
  let loadedPages = 1
  const limit = 100
  const filters = {
    from: formatToISO(from),
    to: formatToISO(to),
  }

  onProgress(0)

  let archives = await webApi.listArchives({
    limit: limit,
    sort_order: "desc",
    filters
  })

  onProgress(Math.round(loadedPages / (archives.foundChats / limit) * 100).toFixed())

  while (true) {
    for (let i = 0; i < archives.chats.length; i++) {
      const chat = archives.chats[i];
      const users = new Map(chat.users.map(u => [u.id, u]))

      for (let j = 0; j < chat.thread.events.length; j++) {
        const event = chat.thread.events[j];

        if (!event.authorId || !event.text) {
          continue
        }

        const author = users.get(event.authorId)

        if (!author) {
          continue
        }

        if (author.type !== "agent") {
          continue
        }

        if (event.type !== "message") {
          continue
        }

        const normalizedText = getNormalizedText(event.text)
        const usedCannedResponse = hashedCannedResponses.get(normalizedText)

        if (usedCannedResponse) {
          const date = new Date(event.createdAt)

          if (Number.isNaN(date.getTime())) {
            continue;
          }

          usages.mark(usedCannedResponse.id, date)
        }
      }
    }

    if (!archives.nextPageId) {
      break
    }

    archives = await webApi.listArchives({
      limit: 100,
      sort_order: "desc",
      page_id: archives.nextPageId,
      filters
    })

    loadedPages++

    onProgress(Math.round(loadedPages / (archives.foundChats / limit) * 100).toFixed())
  }

  return usages
}


async function getSHA1(message) {
  const msgUint8 = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function endOfDay(date) {
  const clone = new Date(date.getTime())

  clone.setHours(23)
  clone.setMinutes(59)
  clone.setSeconds(59)
  clone.setMilliseconds(999)

  return clone
}

function addDays(date, days) {
  const clone = new Date(date.getTime())

  clone.setDate(clone.getDate() + days)

  return clone
}

function getRoundedDownDay(date) {
  return Math.floor(date.getTime() / day) * day
}

function getRoundedDownHour(date) {
  return Math.floor(date.getTime() / hour) * hour
}

function formatToISO(date) {
  return date.toISOString().replace("Z", "000Z")
}

function getNormalizedText(text) {
  if (typeof text !== "string") {
    return ""
  }

  return text.trim()
}

function getTableData(cannedResponses, usages) {
  return cannedResponses
    .map(function (cannedResponse) {
      const usage = usages.getUsage(cannedResponse.id)
      const totalUsed = usage ? usage.total : 0;

      return {
        id: cannedResponse.id,
        text: cannedResponse.text,
        tags: cannedResponse.tags,
        totalUsed: totalUsed
      }
    })
    .sort(function (a, b) {
      return b.totalUsed - a.totalUsed
    })
}

/**
 * 
 * @param {HTMLElement} container 
 */
function renderTable(container, data, options) {
  const table = document.createElement("table")

  container.appendChild(table)

  table.className = "table"
  table.innerHTML = `
  <colgroup>
    <!-- <col span="1" style="width: 4%;"> -->
    <col span="1" style="width: 70%;">
    <col span="1" style="width: 26%;">
    <!-- <col span="1" style="width: 15%;"> -->
  </colgroup>

  <thead>
    <tr>
      <!-- <th scope="col"></th> -->
      <th scope="col">Canned Response</th>
      <th scope="col">Used</th>
      <!-- <th scope="col"></th> -->
    </tr>
  </thead>

  <tbody>
  <tbody>
  `

  const body = table.getElementsByTagName("tbody")[0];

  if (!body) {
    throw new Error("`body` can't be empty")
  }

  // add data
  if (!Array.isArray(data)) {
    throw new Error("`data` should be an array")
  }

  data.forEach(function (row) {
    const tr = document.createElement("tr")

    tr.innerHTML = escapeHtml`
      <!-- <td>
        <input type="checkbox" />
      </tb> -->
      <td>
        <p class="canned-response-text">${row.text}</p>
        <div class="tags"></div>
      </td>
      <td>${row.totalUsed} ${row.totalUsed === 1 ? "time" : "times"}</td>
      <!-- <td><a href="#">Delete</a></td> -->
    `

    const tags = tr.querySelector(".tags")

    if (!tags) {
      throw new Error("`tags` can't be empty")
    }

    row.tags.map(function (tag) {
      const span = document.createElement("span")

      span.className = "tag"
      span.innerHTML = escapeHtml`<i>#</i>${tag}`

      tags.appendChild(span)
    })

    body.appendChild(tr)
  })
}

function escapeHtml(data) {
  var s = data[0];

  for (var i = 1; i < arguments.length; i++) {
    var arg = String(arguments[i]);

    // Escape special characters in the substitution.
    s += arg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Don't escape special characters in the template.
    s += data[i];
  }

  return s;
}
