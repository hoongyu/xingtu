/* 让「看起来能点」的东西真的能点，包括用键盘。
 *
 * 这个站有一批控件是 <div> 加一个 click 监听：侧栏那六十来枚星官按钮、
 * 检索结果的每一行、「收 起」「检 索」「来 源」「抬 头 日 签」、
 * 各个弹层的关闭。它们光标是 pointer、看着就是按钮，
 * 可**键盘一个都够不到** —— 实测全页只有十四个元素能 Tab 到，
 * 而左边那栏正是找三百零八个星官的主路径。
 *
 * 另一件同样要紧的：全站原来只有三条 :focus 规则。
 * 就算能 Tab 过去，也**看不出焦点在哪儿**。
 *
 * 两件事都在这里补：
 *   · 给这些 div 补上 role=button 与 tabindex，让它们进 Tab 序
 *   · 一个代理监听把回车和空格翻成 click，不用每个控件各写一遍，
 *     以后新加的也自动有
 * 焦点圈在 CSS 里统一给（engine.css 的 :focus-visible 那一段）。
 *
 * 不管 SVG 上那九百多个星点与连线：把它们逐个塞进 Tab 序等于让人
 * 按九百多下。键盘的路子是侧栏和检索栏，那两样管够 —— 前提是它们能用。
 */
const SEL = [
  '#dailybtn', '#back', '#railtoggle', '#srcbtn', '#howbtn', '#srcclose',
  '#close', '#cardclose', '#skipall', '#cardbtn', '#readtoggle',
  '#zsrcbtn', '#zsrcclose', '#zformtoggle', '#zreadtoggle', '#zclose',
  '.chip', '.fx', '.tapable', '.calnav', '.zcalnav', '.zp',
  /* 只列**自己挂了 click 的**元素。按 cursor:pointer 去找会把它们的
     子元素一并算进来（.zp 底下的宫名、干支、星曜都继承了 pointer，
     实测一下多出七十七个），那不是按钮，是同一个按钮的内部。 */
  /* 检索结果那几行**不收进 Tab 序**：检索框本身已经有上下键选、
     回车确认、Esc 清空的那一套（组合框的标准做法）。
     再让每一行各占一个 Tab 位，只会让人多按几十下。 */
].join(',');

/** 把 root 里符合条件的 div 收进 Tab 序。渲染完新内容再叫一次即可，
 *  已经处理过的不会重复加。 */
export function armButtons(root = document){
  for (const e of root.querySelectorAll(SEL)){
    if (e.hasAttribute('tabindex')) continue;
    if (/^(BUTTON|A|SELECT|INPUT|TEXTAREA)$/.test(e.tagName)) continue;
    e.setAttribute('role', 'button');
    e.setAttribute('tabindex', '0');
  }
}

/* 回车与空格等价于点一下。代理在 document 上，装一次管全页。
   空格要 preventDefault，否则页面会跟着滚一屏。 */
let bound = false;
export function bindKeys(){
  if (bound) return;
  bound = true;
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    const t = e.target && e.target.closest && e.target.closest('[role="button"]');
    if (!t) return;
    e.preventDefault();
    t.click();
  });
}

export function a11y(root){ armButtons(root); bindKeys(); }

/* ── 日历这种「格子」要用方向键，不能一格一个 Tab 位 ──────────
   星盘和紫微的小历一个月三十一格。全塞进 Tab 序，意味着要按三十多下
   才走到「时」那一栏 —— 能到达不等于能用。

   网格控件的通行做法是 roving tabindex：整块只占一个 Tab 位，
   进去之后用方向键在格子间走，回车选中。这跟系统日期控件的手感一致。 */
export function armGrid(box, sel){
  if (!box || box.dataset.grid) return;
  box.dataset.grid = '1';
  const cells = () => [...box.querySelectorAll(sel)];
  const sync = () => {
    const cs = cells();
    if (!cs.length) return;
    const on = cs.find(c => c.classList.contains('on')) || cs[0];
    for (const c of cs){
      c.setAttribute('role', 'gridcell');
      c.tabIndex = c === on ? 0 : -1;
    }
  };
  box.setAttribute('role', 'grid');
  sync();
  // 内容整片重排之后要重新定 tabindex（翻月就是整片重排）
  if (window.MutationObserver)
    new MutationObserver(() => sync()).observe(box, { childList: true, subtree: true });

  box.addEventListener('keydown', e => {
    const cs = cells();
    const i = cs.indexOf(document.activeElement);
    if (i < 0) return;
    // 一行七格，是星期。上下就是加减七。
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step == null){
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); cs[i].click(); }
      return;
    }
    e.preventDefault();
    const j = Math.max(0, Math.min(cs.length - 1, i + step));
    cs[i].tabIndex = -1;
    cs[j].tabIndex = 0;
    cs[j].focus();
  });
}
