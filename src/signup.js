// @ts-nocheck
async function submitSignup(page, { name, phone, place, password, referral }) {
  try {
    console.log(`   📝 Filling form for ${phone}`);
    
    // ========== FILL FORM ==========
    const filled = await page.evaluate((data) => {
      // Use the native setter so React's value tracker sees a real change.
      // Assigning `input.value` directly can update what is painted while
      // leaving the framework state empty, causing client validation to reject
      // an apparently valid phone number at submit time.
      function setValue(input, value) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }

      function findInput(patterns, type = null) {
        let selector = 'input:not([type="hidden"]):not([type="submit"])';
        if (type) {
          selector = `input[type="${type}"]`;
        }
        const allInputs = document.querySelectorAll(selector);
        
        for (const input of allInputs) {
          const name = (input.name || '').toLowerCase();
          const placeholder = (input.placeholder || '').toLowerCase();
          const id = (input.id || '').toLowerCase();
          
          for (const pattern of patterns) {
            const p = pattern.toLowerCase();
            // Do not search utility CSS classes. For example, Tailwind's
            // "placeholder:*" classes contain "place", which previously
            // made the Place matcher select the Full Name input.
            if (name.includes(p) || placeholder.includes(p) || id.includes(p)) {
              return input;
            }
          }
        }
        return null;
      }

      const phoneInput = findInput(['phone', 'mobile', 'tel', 'number']);
      const nameInput = findInput(['name', 'username', 'fullname', 'full name']);
      const placeInput = findInput(['place', 'location', 'city', 'address']);
      const passInput = document.querySelector('input[type="password"]');
      const refInput = findInput(['referral', 'ref', 'referralcode', 'invite', 'code', 'sponsor']);

      if (phoneInput) {
        setValue(phoneInput, data.phone);
      }

      if (nameInput) {
        setValue(nameInput, data.name);
      }

      if (placeInput) {
        setValue(placeInput, data.place);
      }

      if (passInput) {
        setValue(passInput, data.password);
      }

      if (refInput) {
        setValue(refInput, data.referral);
      }

      // Return all field info for debugging
      return {
        phone: phoneInput ? { name: phoneInput.name, id: phoneInput.id } : null,
        name: nameInput ? { name: nameInput.name, id: nameInput.id } : null,
        place: placeInput ? { name: placeInput.name, id: placeInput.id } : null,
        password: passInput ? { name: passInput.name, id: passInput.id } : null,
        referral: refInput ? { name: refInput.name, id: refInput.id, className: refInput.className } : null
      };
    }, { name, phone, place, password, referral });

    console.log(`   ✅ Fields filled:`, filled);

    // ========== TAKE SCREENSHOT BEFORE SUBMIT ==========
    await page.screenshot({ 
      path: `screenshots/before-submit-${phone}.png`,
      fullPage: true 
    });

    // ========== FIND ALL BUTTONS ON PAGE ==========
    console.log(`   🔍 Finding all buttons...`);
    
    const buttons = await page.$$eval('button, input[type="submit"], [role="button"], .btn, .button, a.button, div[onclick]', (els) => {
      return els.map(el => ({
        tag: el.tagName,
        type: el.type || '',
        text: (el.textContent || el.value || '').trim(),
        className: el.className || '',
        id: el.id || '',
        name: el.name || '',
        visible: el.offsetParent !== null,
        disabled: el.disabled || false
      }));
    });
    
    console.log(`   📋 Found ${buttons.length} buttons:`);
    buttons.forEach((btn, idx) => {
      console.log(`      ${idx + 1}. ${btn.tag}${btn.type ? ` type="${btn.type}"` : ''} "${btn.text}" ${btn.className ? `class="${btn.className}"` : ''} ${btn.id ? `id="${btn.id}"` : ''} ${btn.visible ? '✅ visible' : '❌ hidden'} ${btn.disabled ? '🚫 disabled' : ''}`);
    });

    // ========== TRY TO CLICK SUBMIT ==========
    console.log(`   🔘 Attempting to click submit...`);
    
    let clicked = false;
    let clickMethod = '';

    // METHOD 1: Click by exact text match
    const exactTexts = ['Create Account', 'Create account', 'Sign Up', 'Sign up', 'Register', 'Submit', 'Join Now', 'Continue', 'Next'];
    for (const text of exactTexts) {
      if (clicked) break;
      try {
        const btn = await page.$(`button:has-text("${text}")`);
        if (btn) {
          await btn.click({ force: true, timeout: 2000 });
          clicked = true;
          clickMethod = `Exact text: "${text}"`;
          console.log(`   ✅ Clicked by exact text: "${text}"`);
        }
      } catch (e) {}
    }

    // METHOD 2: Click by partial text match
    if (!clicked) {
      const partialTexts = ['Create', 'Sign', 'Register', 'Submit', 'Join', 'Continue', 'Next', 'Save', 'Go'];
      for (const text of partialTexts) {
        if (clicked) break;
        try {
          const btn = await page.$(`button:has-text("${text}")`);
          if (btn) {
            await btn.click({ force: true, timeout: 2000 });
            clicked = true;
            clickMethod = `Partial text: "${text}"`;
            console.log(`   ✅ Clicked by partial text: "${text}"`);
          }
        } catch (e) {}
      }
    }

    // METHOD 3: Click by selector
    if (!clicked) {
      const selectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button.submit-btn',
        'button.btn-primary',
        'button.btn-success',
        'button.primary-btn',
        'button.success-btn',
        'button.register-btn',
        'button.signup-btn',
        'button.create-account-btn',
        '.submit-btn',
        '.register-btn',
        '.signup-btn',
        '.create-account-btn',
        '#submit',
        '#register',
        '#signup',
        '.btn-primary',
        '.btn-success'
      ];
      
      for (const selector of selectors) {
        if (clicked) break;
        try {
          const btn = await page.$(selector);
          if (btn) {
            await btn.click({ force: true, timeout: 2000 });
            clicked = true;
            clickMethod = `Selector: ${selector}`;
            console.log(`   ✅ Clicked by selector: ${selector}`);
          }
        } catch (e) {}
      }
    }

    // METHOD 4: JavaScript click all visible buttons
    if (!clicked) {
      console.log(`   🔄 Trying JavaScript click all visible buttons...`);
      const result = await page.evaluate(() => {
        const allButtons = document.querySelectorAll('button, input[type="submit"], [role="button"], .btn, .button');
        let clickedCount = 0;
        
        for (const btn of allButtons) {
          if (btn.offsetParent !== null && !btn.disabled) {
            btn.click();
            btn.dispatchEvent(new Event('click', { bubbles: true }));
            clickedCount++;
          }
        }
        return clickedCount;
      });
      
      if (result > 0) {
        clicked = true;
        clickMethod = `JavaScript clicked ${result} buttons`;
        console.log(`   ✅ ${clickMethod}`);
      }
    }

    // METHOD 5: Click by position (find any visible button and click)
    if (!clicked) {
      console.log(`   🔄 Trying to click any visible button...`);
      try {
        const btn = await page.$('button:visible, input[type="submit"]:visible, .btn:visible');
        if (btn) {
          await btn.click({ force: true, timeout: 2000 });
          clicked = true;
          clickMethod = 'First visible button';
          console.log(`   ✅ Clicked first visible button`);
        }
      } catch (e) {}
    }

    // METHOD 6: Press Enter
    if (!clicked) {
      console.log(`   🔄 Trying Enter key...`);
      try {
        await page.focus('input:not([type="hidden"])');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
        await page.keyboard.press('Enter');
        clicked = true;
        clickMethod = 'Enter key pressed twice';
        console.log(`   ✅ Pressed Enter`);
      } catch (e) {}
    }

    // METHOD 7: Submit form directly
    if (!clicked) {
      console.log(`   🔄 Trying direct form submit...`);
      try {
        await page.evaluate(() => {
          const form = document.querySelector('form');
          if (form) {
            form.submit();
            return true;
          }
          return false;
        });
        clicked = true;
        clickMethod = 'Direct form submit';
        console.log(`   ✅ Direct form submit`);
      } catch (e) {}
    }

    // METHOD 8: Click using Playwright's click with force
    if (!clicked) {
      console.log(`   🔄 Trying force click on all buttons...`);
      try {
        const allBtns = await page.$$('button, input[type="submit"]');
        for (const btn of allBtns) {
          try {
            await btn.click({ force: true, timeout: 1000 });
            clicked = true;
            clickMethod = 'Force clicked a button';
            console.log(`   ✅ Force clicked a button`);
            break;
          } catch (e) {}
        }
      } catch (e) {}
    }

    if (!clicked) {
      console.log(`   ❌ NO CLICK METHOD WORKED!`);
      console.log(`   📋 Available buttons:`, buttons);
      throw new Error('Could not click any submit button');
    }

    console.log(`   ✅ Form submitted using: ${clickMethod}`);

    // ========== TAKE SCREENSHOT AFTER SUBMIT ==========
    await page.waitForTimeout(1000);
    await page.screenshot({ 
      path: `screenshots/after-submit-${phone}.png`,
      fullPage: true 
    });

    return true;

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    
    // Take error screenshot
    try {
      await page.screenshot({ 
        path: `screenshots/error-${phone}-${Date.now()}.png`,
        fullPage: true 
      });
    } catch (e) {}
    
    throw error;
  }
}

module.exports = { submitSignup };
