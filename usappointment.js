const puppeteer = require("puppeteer");
const parseArgs = require("minimist");
const axios = require("axios");

(async () => {
  //#region Command line args
  const args = parseArgs(process.argv.slice(2), {
    string: ["u", "p", "c", "a", "n", "d", "r", "m", "l"],
    boolean: ["g", "s", "v"],
  });
  const usernameInput = args.u;
  const passwordInput = args.p;
  const appointmentId = args.a;
  const retryTimeout = args.t * 1000;
  const consularId = args.c;
  const userToken = args.n;
  const appToken = args.m;
  const groupAppointment = args.g;
  const noSandbox = args.s;
  const lang = args.l;
  const visible = args.v;
  const region = args.r;
  
  var currentDate = new Date(args.d);
  var working = false;
  var notWorkingSince = new Date();
  var notifiedNotWorking = new Date();
  var firstDate = null;
  var maxDatePickerAttempts = 12 * 2;

  //#endregion

  //#region Helper functions
  async function waitForSelectors(selectors, frame, options) {
    for (const selector of selectors) {
      try {
        return await waitForSelector(selector, frame, options);
      } catch (err) {}
    }
    throw new Error(
      "could not find element for selectors: " + JSON.stringify(selectors),
    );
  }

  async function scrollIntoViewIfNeeded(element, timeout) {
    await waitForConnected(element, timeout);
    const isInViewport = await element.isIntersectingViewport({ threshold: 0 });
    if (isInViewport) {
      return;
    }
    await element.evaluate((element) => {
      element.scrollIntoView({
        block: "center",
        inline: "center",
        behavior: "auto",
      });
    });
    await waitForInViewport(element, timeout);
  }

  async function waitForConnected(element, timeout) {
    await waitForFunction(async () => {
      return await element.getProperty("isConnected");
    }, timeout);
  }

  async function waitForInViewport(element, timeout) {
    await waitForFunction(async () => {
      return await element.isIntersectingViewport({ threshold: 0 });
    }, timeout);
  }

  async function waitForSelector(selector, frame, options) {
    if (!Array.isArray(selector)) {
      selector = [selector];
    }
    if (!selector.length) {
      throw new Error("empty selector provided to waitForSelector");
    }
    let element = null;
    for (let i = 0; i < selector.length; i++) {
      const part = selector[i];
      if (element) {
        element = await element.waitForSelector(part, options);
      } else {
        element = await frame.waitForSelector(part, options);
      }
      if (!element) {
        throw new Error("could not find element: " + selector.join(">>"));
      }
      if (i < selector.length - 1) {
        element = (
          await element.evaluateHandle((el) =>
            el.shadowRoot ? el.shadowRoot : el,
          )
        ).asElement();
      }
    }
    if (!element) {
      throw new Error("could not find element: " + selector.join("|"));
    }
    return element;
  }

  async function waitForFunction(fn, timeout) {
    let isActive = true;
    setTimeout(() => {
      isActive = false;
    }, timeout);
    while (isActive) {
      const result = await fn();
      if (result) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("timed out");
  }

  async function sleep(timeout) {
    return await new Promise((resolve) => setTimeout(resolve, timeout));
  }

  async function log(msg) {
    const currentDate = "[" + new Date().toLocaleString() + "]";
    console.log(currentDate, msg);
  }

  async function notify(msg) {
    log(msg);

    if (!userToken) {
      return;
    }

    if (!appToken) {
      return;
    }

    const apiEndpoint = "https://api.pushover.net/1/messages.json";
    const data = {
      token: appToken,
      user: userToken,
      message: msg,
    };

    await axios.post(apiEndpoint, data);
  }
  //#endregion

  async function runLogic() {
    log("launching browser");

    var pSettings = {
      headless: true,
    };

    if (visible) {
      pSettings.headless = false;
    }

    if (noSandbox) {
      log("no sandbox");

      pSettings["args"] = [
        "--no-sandbox",
        "--disable-gpu",
        "--disable-setuid-sandbox",
      ];
    }
    //#region Init puppeteer
    const browser = await puppeteer.launch(pSettings);

    try {
      log("launched");

      // Comment above line and uncomment following line to see puppeteer in action
      //const browser = await puppeteer.launch({ headless: false });
      const page = await browser.newPage();
      const timeout = 5000;
      const navigationTimeout = 60000;
      const smallTimeout = 100;
      page.setDefaultTimeout(timeout);
      page.setDefaultNavigationTimeout(navigationTimeout);
      //#endregion

      //#region Logic

      log("set the viewport to avoid elements changing places ");

      {
        const targetPage = page;
        await targetPage.setViewport({ width: 2078, height: 1479 });
      }

      log("go to login page");

      {
        const targetPage = page;
        await targetPage.goto(
          "https://ais.usvisa-info.com/" +
            lang +
            "-" +
            region +
            "/niv/users/sign_in",
          { waitUntil: "domcontentloaded" },
        );
      }

      log("click on username input");
      {
        const targetPage = page;
        const element = await waitForSelectors(
          [["aria/Email *"], ["#user_email"]],
          targetPage,
          { timeout, visible: true },
        );
        await scrollIntoViewIfNeeded(element, timeout);
        await element.click({ offset: { x: 118, y: 21.453125 } });
      }

      log("type username");
      {
        const targetPage = page;
        const element = await waitForSelectors(
          [["aria/Email *"], ["#user_email"]],
          targetPage,
          { timeout, visible: true },
        );
        await scrollIntoViewIfNeeded(element, timeout);
        const type = await element.evaluate((el) => el.type);
        if (
          [
            "textarea",
            "select-one",
            "text",
            "url",
            "tel",
            "search",
            "password",
            "number",
            "email",
          ].includes(type)
        ) {
          await element.type(usernameInput);
        } else {
          await element.focus();
          await element.evaluate((el, value) => {
            el.value = value;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }, usernameInput);
        }
      }

      log("hit tab to go to the password input");
      {
        const targetPage = page;
        await targetPage.keyboard.down("Tab");
      }
      {
        const targetPage = page;
        await targetPage.keyboard.up("Tab");
      }

      log("type password");
      {
        const targetPage = page;
        const element = await waitForSelectors(
          [["aria/Password"], ["#user_password"]],
          targetPage,
          { timeout, visible: true },
        );
        await scrollIntoViewIfNeeded(element, timeout);
        const type = await element.evaluate((el) => el.type);
        if (
          [
            "textarea",
            "select-one",
            "text",
            "url",
            "tel",
            "search",
            "password",
            "number",
            "email",
          ].includes(type)
        ) {
          await element.type(passwordInput);
        } else {
          await element.focus();
          await element.evaluate((el, value) => {
            el.value = value;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }, passwordInput);
        }
      }

      log("tick the checkbox for agreement");
      {
        const targetPage = page;
        const element = await waitForSelectors(
          [
            [
              "#sign_in_form > div.radio-checkbox-group.margin-top-30 > label > div",
            ],
          ],
          targetPage,
          { timeout, visible: true },
        );
        await scrollIntoViewIfNeeded(element, timeout);
        await element.click({ offset: { x: 9, y: 16.34375 } });
      }

      log("click login button");
      {
        const targetPage = page;
        const element = await waitForSelectors(
          [['[name="commit"]'], ["#new_user > p:nth-child(9) > input"]],
          targetPage,
          { timeout, visible: true },
        );
        await scrollIntoViewIfNeeded(element, timeout);
        await element.click({ offset: { x: 34, y: 11.34375 } });
        await targetPage.waitForNavigation();
      }
      
      log("we are logged in now. check available dates from the API");
      {
        const targetPage = page;
        await page.setExtraHTTPHeaders({
          Accept: "application/json, text/javascript, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest",
        });
        const response = await targetPage.goto(
          "https://ais.usvisa-info.com/" +
            lang +
            "-" +
            region +
            "/niv/schedule/" +
            appointmentId +
            "/appointment/days/" +
            consularId +
            ".json?appointments[expedite]=false",
        );

        const availableDates = JSON.parse(await response.text());

        if (availableDates.length <= 0) {
          log(
            "there are no available dates for consulate with id " + consularId,
          );

          return false;
        }

        firstDate = new Date(availableDates[0].date);

        if (firstDate > currentDate) {
          log(
            "there is not an earlier date available than " +
            currentDate.toISOString().slice(0, 10) + 
            ", first available date is " 
            + firstDate.toISOString().slice(0, 10));

          return false;
        }

        notify(
          "found an earlier date! " + firstDate.toISOString().slice(0, 10),
        );

        // exclude asia trip
        if (firstDate < new Date("2024-06-01") && firstDate > new Date("2024-03-01")){
          notify("the day is not in the available area for you, sorry :(")

          return false;
        }

        // exclude military service
        if (firstDate < new Date("2024-09-22") && firstDate > new Date("2024-08-21")) {
          notify("the day is not in the available area for you, sorry :(")

          return false;
        }
      }

      log("go to appointment page");
      {
        const targetPage = page;
        await targetPage.goto(
          "https://ais.usvisa-info.com/" +
            lang +
            "-" +
            region +
            "/niv/schedule/" +
            appointmentId +
            "/appointment",
          { waitUntil: "domcontentloaded" },
        );
        await sleep(1000);
      }

      log("select multiple people if it is a group appointment");
      {
        if (groupAppointment) {
          const targetPage = page;
          const element = await waitForSelectors(
            [
              ["aria/Continue"],
              [
                "#main > div.mainContent > form > div:nth-child(3) > div > input",
              ],
            ],
            targetPage,
            { timeout, visible: true },
          );
          await scrollIntoViewIfNeeded(element, timeout);
          await element.click({ offset: { x: 70.515625, y: 25.25 } });
          await sleep(1000);
        }
      }

      log("select the specified consular from the dropdown");
      {
        const targetPage = page;
        const element = await waitForSelectors(
          [
            ["aria/Consular Section Appointment", 'aria/[role="combobox"]'],
            ["#appointments_consulate_appointment_facility_id"],
          ],
          targetPage,
          { timeout, visible: true },
        );
        await scrollIntoViewIfNeeded(element, timeout);
        await page.select(
          "#appointments_consulate_appointment_facility_id",
          consularId,
        );
        await sleep(1000);
        
        //await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: navigationTimeout });
      }

      log("click on date input");
      {
        const targetPage = page;
        const element = await waitForSelectors(
          [
            ["aria/Date of Appointment *"],
            ["#appointments_consulate_appointment_date"],
          ],
          targetPage,
          { timeout, visible: true },
        );
        await scrollIntoViewIfNeeded(element, timeout);
        await element.click({ offset: { x: 394.5, y: 17.53125 } });

        //await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: navigationTimeout });

        await sleep(1000);
      }

      log(
        "keep clicking next button until we find the first available date and click to that date",
      );
      {
        const targetPage = page;

        var count = 0;
        while (true) {
          if (++count > maxDatePickerAttempts){
            log("cancelled date picking, something is off");

            return false;
          }
          
          try {
            const element = await waitForSelectors(
              [
                ['aria/25[role="link"]'],
                [
                  "#ui-datepicker-div > div.ui-datepicker-group.ui-datepicker-group > table > tbody > tr > td.undefined > a",
                ],
              ],
              targetPage,
              { timeout: smallTimeout, visible: true },
            );
            await scrollIntoViewIfNeeded(element, timeout);
            await page.click(
              "#ui-datepicker-div > div.ui-datepicker-group.ui-datepicker-group > table > tbody > tr > td.undefined > a",
            );
            await sleep(500);
            break;
          } catch (err) {
            {
              const targetPage = page;
              const element = await waitForSelectors(
                [
                  ["aria/Next", 'aria/[role="generic"]'],
                  [
                    "#ui-datepicker-div > div.ui-datepicker-group.ui-datepicker-group-last > div > a > span",
                  ],
                ],
                targetPage,
                { timeout, visible: true },
              );
              await scrollIntoViewIfNeeded(element, timeout);
              await element.click({ offset: { x: 4, y: 9.03125 } });
            }
          }
        }
      }

      log("ensure that we picked the correct time")
      {
        const targetPage = page;
        const element = await waitForSelectors(
          [["#appointments_consulate_appointment_date"]],
          targetPage,
          { timeout, visible: true },
        );

        var pickedDateStr = await element.evaluate((el) => el.value);
        var firstDateStr = firstDate.toISOString().slice(0, 10);

        if (pickedDateStr != firstDateStr){
          notify("sorry, the date " + 
          firstDateStr + 
          "is no longer available, available date at the textbox is " + 
          pickedDateStr + 
          ". someone moved a bit faster.")

          return false;
        }
      }

      log("select the first available time from the time dropdown");
      {
        //await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: navigationTimeout });

        const targetPage = page;
        const element = await waitForSelectors(
          [["#appointments_consulate_appointment_time"]],
          targetPage,
          { timeout, visible: true },
        );
        await scrollIntoViewIfNeeded(element, timeout);
        await page.evaluate(() => {
          document.querySelector(
            "#appointments_consulate_appointment_time option:nth-child(2)",
          ).selected = true;
          const event = new Event("change", { bubbles: true });
          document
            .querySelector("#appointments_consulate_appointment_time")
            .dispatchEvent(event);
        });
        await sleep(1000);
      }

      log("click on reschedule button");
      {
        const targetPage = page;
        const element = await waitForSelectors(
          [["aria/Reschedule"], ["#appointments_submit"]],
          targetPage,
          { timeout, visible: true },
        );
        await scrollIntoViewIfNeeded(element, timeout);
        await element.click({ offset: { x: 78.109375, y: 20.0625 } });
        await sleep(1000);
      }

      log("click on submit button on the confirmation popup");
      {
        const targetPage = page;
        const element = await waitForSelectors(
          [
            ["aria/Cancel"],
            ["body > div.reveal-overlay > div > div > a.button.alert"],
          ],
          targetPage,
          { timeout, visible: true },
        );
        await scrollIntoViewIfNeeded(element, timeout);
        await page.click(
          "body > div.reveal-overlay > div > div > a.button.alert",
        );
        await sleep(5000);
      }
    } finally {
      browser.close();
    }

    log("set new date as " + firstDate.toISOString().slice(0, 10));
    
    currentDate = firstDate;

    return true;
    //#endregion
  }

  function isMinutesAgoOrMore(targetDate, minutesThreshold) {
    // Get the current date and time
    const currentDate = new Date();
  
    // Calculate the time difference in milliseconds
    const timeDifference = currentDate - targetDate;
  
    // Convert minutes threshold to milliseconds
    const thresholdInMilliseconds = minutesThreshold * 60 * 1000;
  
    // Check if the time difference is greater than or equal to the specified threshold
    return timeDifference >= thresholdInMilliseconds;
  }

  notify("app started to look appointment dates earlier than " + currentDate.toISOString().slice(0, 10));

  while (true) {
    try {
      const result = await runLogic();

      working = true;

      if (result) {
        notify("successfully scheduled a new appointment");
      }
     } 
     catch (err) {
      if (!notWorkingSince) {
        notWorkingSince = new Date();
      }

      working = false;
      
      log(err);
    }

    if (working) {
      var okMessage = "working properly";
      if (notifiedNotWorking) {
        notify(okMessage);
        
        notifiedNotWorking = false;
      } else {
        log(okMessage)
      }

      notWorkingSince = null;
    } else {
      var errorMessage = "there is a problem since " + notWorkingSince;
      if (isMinutesAgoOrMore(notWorkingSince, 60) && !notifiedNotWorking) {
        notify(errorMessage);

        notifiedNotWorking = true;
      } else{
        log(errorMessage)
      }
    }

    await sleep(retryTimeout);
  }
})();