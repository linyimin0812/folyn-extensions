// Mirrors the host Activity page. Colours are the host theme tokens and buttons
// are the host `.btn` classes, so theme switches need no handling here.
export const styles = `
.fws{display:flex;flex-direction:column;flex:1 1 0%;align-self:stretch;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;
  background:var(--bg);color:var(--t1);font-family:var(--font-ui);font-size:13px;line-height:1.5}
.fws *{box-sizing:border-box}
.fws input,.fws textarea{font:inherit;color:inherit}
.fws :focus-visible{outline:2px solid var(--acc);outline-offset:1px}
.fws-ico{width:14px;height:14px;flex-shrink:0;display:block}
.fws .btn:disabled{opacity:.5;cursor:default}
.fws .fws-sq{padding:5px 6px}
.fws .fws-sq.on{background:var(--accdim);color:var(--acc)}
.fws .fws-icon{display:flex;align-items:center;justify-content:center;flex-shrink:0;width:24px;height:24px;border-radius:4px;color:var(--t3)}
.fws .fws-icon:hover{color:var(--t1);background:var(--hov)}

/* Page frame */
.fws-header{flex-shrink:0;padding:12px 0;border-bottom:1px solid var(--brd)}
.fws-wrap{max-width:880px;margin:0 auto;padding:0 32px}
.fws-scroll{flex:1;min-height:0;overflow-y:auto}
.fws-content{padding-top:16px;padding-bottom:24px;display:flex;flex-direction:column;gap:16px}
.fws-titlebar{display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:12px 24px}
.fws-heading{display:flex;align-items:center;gap:10px;min-width:0}
.fws-heading h1{margin:0;font-size:17px;font-weight:600;color:var(--t1)}
.fws-heading p{margin:0;font-size:12px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fws-actions{display:flex;align-items:stretch;gap:8px;margin-left:auto}
.fws-quick{display:flex;align-items:center;gap:8px;height:34px;margin-top:12px;padding:0 3px 0 10px;border:1px solid var(--brd2);border-radius:6px;background:var(--panel);transition:border-color .1s}
.fws-quick:focus-within{border-color:var(--acc)}
.fws-quick>.fws-ico{color:var(--t3)}
.fws-quick input{flex:1;min-width:0;height:100%;border:none;background:transparent;font-size:13px;outline:none}
.fws .fws-quick input:focus-visible{outline:none}
.fws-quick input::placeholder{color:var(--t3)}
.fws .fws-more{flex-shrink:0;display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 8px;border-radius:4px;font-size:12px;font-weight:500;color:var(--t2);white-space:nowrap;transition:background .12s,color .12s}
.fws .fws-more:hover{background:var(--hov);color:var(--t1)}
.fws-alert{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px;padding:4px 4px 4px 12px;border:1px solid rgba(239,68,68,.4);border-radius:6px;
  background:rgba(239,68,68,.05);font-size:12px;color:var(--red)}
.fws-alert.info{border-color:transparent;background:var(--accdim);color:var(--acc)}

/* Inputs */
.fws .fws-input{width:100%;min-width:0;height:34px;padding:6px 12px;border:1px solid var(--brd2);border-radius:6px;background:var(--panel);color:var(--t1);font-size:13px;line-height:20px;outline:none;transition:border-color .1s}
.fws .fws-input:focus,.fws .fws-input.on{border-color:var(--acc)}
.fws .fws-input::placeholder{color:var(--t3)}
.fws textarea.fws-input{display:block;height:auto;min-height:60px;resize:vertical}

/* List */
.fws-section{display:flex;flex-direction:column;gap:2px}
.fws-section-title{display:flex;align-items:center;gap:6px;padding:0 8px 4px;font-size:12px;font-weight:500;color:var(--t3)}
.fws-item{padding:6px 8px;border-radius:6px}
.fws-item:hover{background:var(--hov)}
.fws-row{display:flex;align-items:flex-start;gap:10px}
.fws .fws-fold{flex-shrink:0;width:14px;height:20px;margin-right:-4px;display:flex;align-items:center;justify-content:center;color:var(--t3)}
.fws button.fws-fold:hover{color:var(--t1)}
.fws-fold .fws-ico{width:12px;height:12px;transition:transform .12s}
.fws-fold.open .fws-ico{transform:rotate(90deg)}
.fws-rowacts{flex-shrink:0;min-width:68px;display:flex;align-items:center;justify-content:flex-end;gap:4px}
.fws .fws-rowact{flex-shrink:0;display:flex;align-items:center;justify-content:center;min-width:20px;height:20px;border-radius:4px;color:var(--t3);opacity:0}
.fws .fws-rowact:hover{color:var(--t1);background:var(--hov)}
.fws-item:hover .fws-rowact,.fws .fws-rowact:focus-visible,.fws .fws-rowdel.armed{opacity:1}
.fws .fws-rowdel:hover{color:var(--red);background:rgba(239,68,68,.1)}
.fws .fws-rowdel.armed{padding:0 6px;background:var(--red);color:#fff;font-size:11px;white-space:nowrap}
.fws-rowact .fws-ico{width:13px;height:13px}
.fws-children{display:flex;flex-direction:column;gap:2px;margin-left:20px}
.fws-subadd{padding:2px 8px 2px 28px}
.fws .fws-check{width:16px;height:16px;margin-top:2px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border:1px solid var(--brd2);border-radius:50%;background:var(--panel);color:#fff}
.fws-check .fws-ico{width:10px;height:10px;opacity:0}
.fws .fws-check:hover{border-color:var(--acc)}
.fws-item.done .fws-check{background:var(--acc);border-color:var(--acc)}
.fws-item.done .fws-check .fws-ico{opacity:1}
.fws-pri{flex-shrink:0;width:6px;height:6px;margin-top:7px;border-radius:50%;background:var(--dot)}
.fws-pri.high{--dot:var(--red)}.fws-pri.medium{--dot:var(--amber)}.fws-pri.low{--dot:var(--green)}
.fws-main{flex:1;min-width:0;display:flex;flex-wrap:wrap;align-items:baseline;gap:0 8px}
.fws-title{min-width:0;font-size:13px;font-weight:500;line-height:20px;overflow-wrap:anywhere}
.fws-tag{font-size:11px;line-height:20px;color:var(--t3);white-space:nowrap}
.fws-est,.fws-when{flex-shrink:0;font-size:12px;line-height:20px;color:var(--t3);font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.fws-est{width:56px}
.fws-when{width:84px;color:var(--t2)}
.fws-item.done .fws-title{color:var(--t3);font-weight:400;text-decoration:line-through}
.fws-item.done .fws-pri{opacity:.4}
.fws-item.done .fws-when{color:var(--t3)}
.fws-detail{display:flex;flex-wrap:wrap;align-items:center;gap:2px 8px;padding-left:62px;font-size:12px;line-height:18px;color:var(--t2)}
.fws-detail .kind{color:var(--t3)}
.fws-detail .fws-link+.kind{margin-left:8px}
.fws-note{flex:1 1 200px;min-width:0;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fws-empty,.fws-status{padding:32px;border:1px solid var(--brd);border-radius:8px;background:var(--panel);font-size:13px;color:var(--t3);text-align:center}

/* Linked files */
.fws-link{display:inline-flex;align-items:center;gap:4px;max-width:100%;min-width:0;color:var(--acc)}
.fws .fws-link .open{display:inline-flex;align-items:center;gap:4px;min-width:0;color:inherit;font-size:12px}
.fws .fws-link button.open:hover:not(:disabled){text-decoration:underline}
.fws .fws-link button.open:disabled{cursor:not-allowed}
.fws-link .fws-ico{width:12px;height:12px}
.fws-link .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fws-link .vault{color:var(--t3);white-space:nowrap}
.fws-link.other{color:var(--t3)}

/* View switch */
.fws-views{display:flex;border:1px solid var(--brd2);border-radius:6px;overflow:hidden;background:var(--surf2)}
.fws .fws-views button{padding:0 10px;font-size:11px;font-weight:500;color:var(--t2);border-left:1px solid var(--brd2)}
.fws .fws-views button:first-child{border-left:none}
.fws .fws-views button:hover{background:var(--hov);color:var(--t1)}
.fws .fws-views button[aria-pressed=true]{background:var(--accdim);color:var(--acc)}

/* Week */
.fws-week{display:flex;flex-direction:column;gap:12px}
.fws-week-day{display:flex;flex-direction:column;gap:2px}
.fws .fws-week-head{display:flex;align-items:baseline;gap:8px;padding:2px 8px;border-radius:6px;text-align:left;font-size:12px;color:var(--t3)}
.fws .fws-week-head:hover{background:var(--hov)}
.fws-week-head strong{font-size:13px;font-weight:600;color:var(--t1)}
.fws-week-head .badge{padding:0 6px;border-radius:999px;background:var(--accdim);color:var(--acc);font-size:11px}
.fws-week-head .count{margin-left:auto}
.fws-week-day.today .fws-week-head strong{color:var(--acc)}
.fws-week-none{padding:2px 8px 2px 34px;font-size:12px;color:var(--t3)}
.fws-week-item{display:flex;align-items:center;gap:10px;padding:3px 8px 3px 16px;border-radius:6px}
.fws-week-item:hover{background:var(--hov)}
.fws-week-item .fws-check,.fws-week-item .fws-pri{margin-top:0}
.fws .fws-week-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;font-size:13px;color:var(--t1)}
.fws .fws-week-title:hover{text-decoration:underline}
.fws-week-item.done .fws-week-title{color:var(--t3);text-decoration:line-through}
.fws-week-item .fws-when{width:auto;min-width:84px}

/* Month */
.fws-month{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border-top:1px solid var(--brd);border-left:1px solid var(--brd)}
.fws-month-wd{padding:4px 6px;border-right:1px solid var(--brd);border-bottom:1px solid var(--brd);font-size:11px;color:var(--t3)}
.fws .fws-month-day{display:flex;flex-direction:column;align-items:stretch;gap:2px;min-width:0;min-height:96px;padding:4px 6px 6px;border-right:1px solid var(--brd);border-bottom:1px solid var(--brd);background:var(--panel);text-align:left}
.fws .fws-month-day:hover{background:var(--hov)}
.fws .fws-month-day.out{background:transparent}
.fws-month-day.out .num,.fws-month-day.out .fws-month-item{opacity:.45}
.fws-month-day .num{align-self:flex-start;min-width:20px;height:20px;padding:0 4px;border-radius:999px;font-size:11px;line-height:20px;text-align:center;color:var(--t2)}
.fws-month-day.today .num{background:var(--acc);color:#fff;font-weight:600}
.fws-month-item{display:flex;align-items:center;gap:4px;min-width:0;font-size:11px;line-height:16px;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fws-month-item .fws-pri{width:5px;height:5px;margin-top:0}
.fws-month-item.done{color:var(--t3);text-decoration:line-through}
.fws-month-more{font-size:11px;color:var(--t3)}

/* Carry-over review */
.fws-carry{display:flex;flex-direction:column;border:1px solid var(--brd);border-radius:8px;background:var(--panel)}
.fws-carry-head{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px;padding:12px 16px 8px}
.fws-carry-head strong{font-size:13px;font-weight:600}
.fws-carry-head span{flex:1;min-width:200px;font-size:12px;color:var(--t3)}
.fws-carry-list{max-height:320px;overflow-y:auto;padding:0 8px 8px}
.fws-carry-day{padding:8px 8px 2px;font-size:12px;color:var(--t3)}
.fws-carry-row{display:flex;align-items:center;gap:10px;padding:5px 8px;border-radius:6px;cursor:pointer}
.fws-carry-row:hover{background:var(--hov)}
.fws-carry-row input{width:14px;height:14px;margin:0;accent-color:var(--acc);flex-shrink:0}
.fws-carry-row .fws-pri{margin-top:0}
.fws-carry-row .title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fws-carry-row .sub{font-size:12px;color:var(--t3);white-space:nowrap}
.fws-carry-row .fws-link-btn{opacity:0}
.fws-carry-row:hover .fws-link-btn,.fws-carry-row .fws-link-btn:focus-visible{opacity:1}
.fws .fws-link-btn{flex-shrink:0;font-size:12px;color:var(--acc);white-space:nowrap}
.fws .fws-link-btn:hover{text-decoration:underline}
.fws-carry-foot{display:flex;align-items:center;gap:8px;padding:10px 16px;border-top:1px solid var(--brd)}
.fws-carry-foot .spacer{flex:1}

/* Editor */
.fws-editor{display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--brd);border-radius:8px;background:var(--panel)}
.fws-section .fws-editor{margin:4px 0}
.fws .fws-subadd .fws-input{height:28px;padding:3px 8px}
.fws-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px 16px}
.fws-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.fws-field.wide{grid-column:1/-1}
.fws-field>label,.fws-field>.label{font-size:12px;color:var(--t2)}
.fws-control{display:flex;align-items:center;gap:6px;min-width:0}
.fws-control .sep,.fws-control .unit{color:var(--t3);font-size:12px}
.fws-control .fws-input{padding-left:8px;padding-right:8px}
.fws-seg{display:flex;border:1px solid var(--brd2);border-radius:6px;overflow:hidden}
.fws .fws-seg button{flex:1;padding:6px 8px;border-left:1px solid var(--brd2);font-size:13px;line-height:20px;color:var(--t2)}
.fws .fws-seg button:first-child{border-left:none}
.fws .fws-seg button:hover{background:var(--hov)}
.fws .fws-seg button[aria-pressed=true]{background:var(--accdim);color:var(--acc);font-weight:500}
.fws-tags,.fws-links-input{position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;min-height:34px;padding:4px 8px;border:1px solid var(--brd2);border-radius:6px;background:var(--panel);transition:border-color .1s}
.fws-tags{cursor:text}
.fws-tags:focus-within,.fws-links-input:focus-within{border-color:var(--acc)}
.fws-tags input,.fws-links-input input{flex:1;min-width:120px;height:24px;border:none;background:transparent;font-size:13px;outline:none}
.fws .fws-tags input:focus-visible,.fws .fws-links-input input:focus-visible{outline:none}
.fws-tags input::placeholder,.fws-links-input input::placeholder{color:var(--t3)}
.fws-chip,.fws-links-input .fws-link{display:inline-flex;align-items:center;gap:4px;max-width:100%;min-width:0;padding:2px 6px 2px 8px;border-radius:999px;background:var(--surf2);font-size:11px;line-height:16px;color:var(--t2)}
.fws-links-input .fws-link.other{color:var(--t3)}
.fws .fws-chip button,.fws .fws-link .remove{display:inline-flex;flex-shrink:0;color:var(--t3)}
.fws .fws-chip button:hover,.fws .fws-link .remove:hover{color:var(--t1)}
.fws-chip .fws-ico,.fws-link .remove .fws-ico{width:11px;height:11px}
.fws-editor-foot{display:flex;align-items:center;gap:8px}
.fws-editor-foot .spacer{flex:1}
.fws-editor-foot .err{font-size:12px;color:var(--red)}
.fws .fws-date{display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left}
.fws-date .fws-ico{color:var(--t3)}

/* Popovers */
.fws-menu,.fws-cal{position:absolute;top:calc(100% + 6px);z-index:30;border:1px solid var(--brd2);border-radius:8px;background:var(--panel);box-shadow:0 20px 25px -5px rgba(0,0,0,.1),0 8px 10px -6px rgba(0,0,0,.1)}
.fws-menu{left:0;right:0;max-height:264px;overflow:auto;padding:4px}
.fws-menu .hint{padding:6px 8px;font-size:12px;color:var(--t3)}
.fws .fws-menu button{display:flex;align-items:baseline;gap:10px;width:100%;min-width:0;padding:5px 8px;border-radius:4px;text-align:left}
.fws .fws-menu button.active{background:var(--hov)}
.fws-menu .name{flex-shrink:0;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.fws-menu .path{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--t3)}
.fws-picker{position:relative;display:flex}
.fws-field .fws-picker{width:100%}
.fws-cal{width:266px;padding:8px}
.fws-cal.start{left:0}.fws-cal.end{right:0}
.fws-cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.fws-cal-head strong{font-size:13px;font-weight:400;color:var(--t1)}
.fws-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}
.fws-cal-wd{padding:2px 0;font-size:10px;color:var(--t3);text-align:center}
.fws .fws-cal-day{position:relative;height:28px;border-radius:6px;font-size:11px;font-variant-numeric:tabular-nums;color:var(--t1)}
.fws .fws-cal-day:hover{background:var(--hov)}
.fws .fws-cal-day.out{color:var(--t3);opacity:.5}
.fws .fws-cal-day.today{color:var(--acc);font-weight:500}
.fws .fws-cal-day.selected{background:var(--accdim);color:var(--acc);font-weight:500}
.fws .fws-cal-day.mark::after{content:"";position:absolute;left:50%;bottom:3px;width:3px;height:3px;margin-left:-1.5px;border-radius:50%;background:var(--acc)}
.fws .fws-cal-day.mark.done::after{background:var(--green)}
.fws-cal-foot{display:flex;justify-content:flex-end;margin-top:8px}

@media (max-width:640px){
  .fws-wrap{padding-left:16px;padding-right:16px}
  .fws .fws-month-day{min-height:64px;padding:3px}
  .fws-month-item{font-size:10px}
}
`;
