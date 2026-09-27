function toggleMenu(){document.getElementById("menu").classList.toggle("active");}

function money(n){
  return Number(n).toLocaleString("es-DO",{style:"currency",currency:"DOP",minimumFractionDigits:2});
}

async function loadRifas(){
  const box=document.getElementById("raffleList");
  try{
    const rifas=await fetch("/api/rifas").then(r=>r.json());
    box.innerHTML=rifas.map(r=>{
      const sold=Number(r.vendidos||0);
      const pct=Math.min(100,(sold/Number(r.cantidad_boletos))*100);
      return `<article class="raffle">
        <div class="photo">📱</div>
        <div class="raffleBody">
          <span class="tag">✦ RIFA ACTIVA</span>
          <h2>${r.nombre}</h2>
          <p>${r.descripcion||"Participa desde tu celular."}</p>
          <div class="progress"><i style="width:${pct}%"></i></div>
          <div class="price"><span>${sold.toLocaleString()} vendidos</span><b>${money(r.precio_boleto)} / boleto</b></div>
          <button class="btn primary full" onclick="location.href='/compra.html?rifa=${r.id}'">PARTICIPAR →</button>
        </div>
      </article>`;
    }).join("") || "<p>No hay rifas activas.</p>";
  }catch{box.innerHTML="<p>No se pudieron cargar las rifas.</p>";}
}
loadRifas();
