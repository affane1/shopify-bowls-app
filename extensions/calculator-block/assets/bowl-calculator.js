
class BowlCalculator {
  constructor() {
    this.data = null;
    this.selectedBowlModel = null;
    this.selectedIngredients = {};
    this.settings = {};
    this.init();
  }

  init() {
    this.loadData();
    this.setupEventListeners();
    this.hideLoader();
  }

  loadData() {
    const dataScript = document.querySelector('[data-calculator-data]');
    if (dataScript) {
      try {
        const data = JSON.parse(dataScript.textContent);
        this.data = data;
        this.settings = data.settings || {};
        this.renderBowlModels();
      } catch (error) {
        console.error('Error loading calculator data:', error);
      }
    }
  }

  hideLoader() {
    const loader = document.querySelector('.bc-loader');
    const content = document.querySelector('.bc-calculator-content');
    if (loader) loader.style.display = 'none';
    if (content) content.style.display = 'block';
  }

  setupEventListeners() {
    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-select-bowl]')) {
        const modelId = e.target.getAttribute('data-select-bowl');
        this.selectBowlModel(modelId);
      }
      
      if (e.target.matches('[data-add-ingredient]')) {
        const ingredientId = e.target.getAttribute('data-add-ingredient');
        this.addIngredient(parseInt(ingredientId));
      }
      
      if (e.target.matches('[data-remove-ingredient]')) {
        const ingredientId = e.target.getAttribute('data-remove-ingredient');
        this.removeIngredient(parseInt(ingredientId));
      }
    });
  }

  renderBowlModels() {
    const container = document.querySelector('[data-bowl-model-container]');
    if (!container || !this.data.bowlModels) return;

    container.innerHTML = this.data.bowlModels.map(model => `
      <div class="bc-bowl-model-card ${this.selectedBowlModel?.id === model.id ? 'bc-selected' : ''}" 
           data-select-bowl="${model.id}">
        <div class="bc-bowl-icon">🥗</div>
        <h3 class="bc-bowl-name">${model.name}</h3>
        <p class="bc-bowl-description">${model.description}</p>
        <div class="bc-bowl-price">€${model.basePrice.toFixed(2)}</div>
        <div class="bc-bowl-limits">
          ${Object.entries(model.limits).map(([category, limit]) => 
            `<div class="bc-limit-item">${category}: ${limit}</div>`
          ).join('')}
        </div>
        <button class="bc-select-btn ${this.selectedBowlModel?.id === model.id ? 'bc-selected' : ''}"
                data-select-bowl="${model.id}">
          ${this.selectedBowlModel?.id === model.id ? this.settings.selectedText || 'Seleccionado' : this.settings.selectText || 'Seleccionar'}
        </button>
      </div>
    `).join('');
  }

  selectBowlModel(modelId) {
    this.selectedBowlModel = this.data.bowlModels.find(model => model.id == modelId);
    this.selectedIngredients = {};
    this.renderBowlModels();
    this.showIngredientsSection();
    this.renderIngredientCategories();
    this.updateSummary();
  }

  showIngredientsSection() {
    const wrapper = document.querySelector('[data-ingredients-wrapper]');
    if (wrapper) {
      wrapper.style.display = 'flex';
    }
  }

  renderIngredientCategories() {
    const container = document.querySelector('[data-ingredient-categories-container]');
    if (!container || !this.selectedBowlModel) return;

    const categorizedIngredients = this.groupIngredientsByCategory();
    
    container.innerHTML = this.data.categoryOrder.map(category => {
      const ingredients = categorizedIngredients[category] || [];
      if (ingredients.length === 0) return '';

      const limit = parseInt(this.selectedBowlModel.limits[category]) || 0;
      const currentCount = this.getIngredientCountForCategory(category);
      const isLimitReached = currentCount >= limit;

      return `
        <div class="bc-category-section">
          <div class="bc-category-header">
            <h3 class="bc-category-title">
              ${this.getCategoryEmoji(category)} ${category}
            </h3>
            <div class="bc-category-counter ${isLimitReached ? 'bc-limit-reached' : ''}">
              ${currentCount}/${limit}
            </div>
          </div>
          ${isLimitReached ? `
            <div class="bc-limit-warning">
              ${this.settings.limitWarningText || 'Has alcanzado el límite para esta categoría. Ingredientes adicionales tendrán costo extra.'}
            </div>
          ` : ''}
          <div class="bc-ingredients-grid">
            ${ingredients.map(ingredient => this.renderIngredientCard(ingredient, isLimitReached)).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  renderIngredientCard(ingredient, isLimitReached) {
    const quantity = this.selectedIngredients[ingredient.id] || 0;

    return `
      <div class="bc-ingredient-card">
        <div class="bc-ingredient-header">
          <h4 class="bc-ingredient-name">${ingredient.nombre}</h4>
          ${isLimitReached ? `<span class="bc-extra-price">+€${ingredient.extraPrecio.toFixed(2)}</span>` : ''}
        </div>
        <div class="bc-ingredient-macros">
          <div class="bc-macro">Cal: ${ingredient.calorias}</div>
          <div class="bc-macro">Prot: ${ingredient.proteinas}g</div>
          <div class="bc-macro">Carb: ${ingredient.carbohidratos}g</div>
          <div class="bc-macro">Gras: ${ingredient.grasas}g</div>
        </div>
        <div class="bc-ingredient-controls">
          <button class="bc-quantity-btn" data-remove-ingredient="${ingredient.id}" ${quantity === 0 ? 'disabled' : ''}>-</button>
          <span class="bc-quantity">${quantity}</span>
          <button class="bc-quantity-btn" data-add-ingredient="${ingredient.id}">+</button>
        </div>
      </div>
    `;
  }

  groupIngredientsByCategory() {
    const grouped = {};
    this.data.ingredients.forEach(ingredient => {
      if (!grouped[ingredient.categoria]) {
        grouped[ingredient.categoria] = [];
      }
      grouped[ingredient.categoria].push(ingredient);
    });
    return grouped;
  }

  getIngredientCountForCategory(category) {
    return this.data.ingredients
      .filter(ingredient => ingredient.categoria === category)
      .reduce((total, ingredient) => total + (this.selectedIngredients[ingredient.id] || 0), 0);
  }

  getCategoryEmoji(category) {
    const emojis = {
      'Base': '🍚',
      'Proteína': '🍗',
      'Toppings': '🌶️',
      'Gainzz': '💪'
    };
    return emojis[category] || '🥗';
  }

  addIngredient(ingredientId) {
    this.selectedIngredients[ingredientId] = (this.selectedIngredients[ingredientId] || 0) + 1;
    this.renderIngredientCategories();
    this.updateSummary();
  }

  removeIngredient(ingredientId) {
    if (this.selectedIngredients[ingredientId] > 0) {
      this.selectedIngredients[ingredientId]--;
      if (this.selectedIngredients[ingredientId] === 0) {
        delete this.selectedIngredients[ingredientId];
      }
    }
    this.renderIngredientCategories();
    this.updateSummary();
  }

  updateSummary() {
    const container = document.querySelector('[data-summary-container]');
    if (!container || !this.selectedBowlModel) return;

    const totals = this.calculateTotals();
    
    container.innerHTML = `
      <div class="bc-summary-card">
        <h3 class="bc-summary-title">${this.settings.orderSummaryText || 'Resumen del Pedido'}</h3>
        
        <div class="bc-selected-bowl">
          <h4>${this.selectedBowlModel.name}</h4>
          <span class="bc-price">€${this.selectedBowlModel.basePrice.toFixed(2)}</span>
        </div>

        ${Object.keys(this.selectedIngredients).length > 0 ? `
          <div class="bc-selected-ingredients">
            <h5>${this.settings.ingredientsText || 'Ingredientes:'}:</h5>
            ${Object.entries(this.selectedIngredients).map(([id, quantity]) => {
              const ingredient = this.data.ingredients.find(ing => ing.id == id);
              const category = ingredient.categoria;
              const limit = parseInt(this.selectedBowlModel.limits[category]) || 0;
              const categoryCount = this.getIngredientCountForCategory(category);
              const extraQuantity = this.getExtraQuantityForIngredient(parseInt(id), category);
              
              return `
                <div class="bc-ingredient-summary">
                  <span>${ingredient.nombre} x${quantity}</span>
                  ${extraQuantity > 0 ? `<span class="bc-extra">+€${(ingredient.extraPrecio * extraQuantity).toFixed(2)}</span>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}

        <div class="bc-nutrition-summary">
          <h5>${this.settings.nutritionText || 'Información Nutricional:'}:</h5>
          <div class="bc-macro-grid">
            <div class="bc-macro-item">
              <span class="bc-macro-label">Calorías</span>
              <span class="bc-macro-value">${totals.calories}</span>
            </div>
            <div class="bc-macro-item">
              <span class="bc-macro-label">Proteínas</span>
              <span class="bc-macro-value">${totals.protein}g</span>
            </div>
            <div class="bc-macro-item">
              <span class="bc-macro-label">Carbohidratos</span>
              <span class="bc-macro-value">${totals.carbs}g</span>
            </div>
            <div class="bc-macro-item">
              <span class="bc-macro-label">Grasas</span>
              <span class="bc-macro-value">${totals.fats}g</span>
            </div>
          </div>
        </div>

        <div class="bc-price-summary">
          <div class="bc-price-row">
            <span>${this.settings.baseText || 'Bowl base:'}:</span>
            <span>€${this.selectedBowlModel.basePrice.toFixed(2)}</span>
          </div>
          ${totals.extraPrice > 0 ? `
            <div class="bc-price-row">
              <span>${this.settings.extrasText || 'Extras:'}:</span>
              <span>€${totals.extraPrice.toFixed(2)}</span>
            </div>
          ` : ''}
          <div class="bc-price-total">
            <span>${this.settings.totalText || 'Total:'}:</span>
            <span>€${totals.totalPrice.toFixed(2)}</span>
          </div>
        </div>

        <button class="bc-add-to-cart-btn">${this.settings.addToCartText || 'Añadir al Carrito'}</button>
      </div>
    `;
  }

  getExtraQuantityForIngredient(ingredientId, category) {
    const limit = parseInt(this.selectedBowlModel.limits[category]) || 0;
    const categoryIngredients = this.data.ingredients.filter(ing => ing.categoria === category);
    
    // Sort selected ingredients in this category by selection order
    const selectedInCategory = [];
    categoryIngredients.forEach(ingredient => {
      const quantity = this.selectedIngredients[ingredient.id] || 0;
      for (let i = 0; i < quantity; i++) {
        selectedInCategory.push(ingredient.id);
      }
    });

    // Count how many of this specific ingredient are over the limit
    let extraCount = 0;
    let currentCount = 0;
    
    selectedInCategory.forEach(id => {
      currentCount++;
      if (currentCount > limit && id === ingredientId) {
        extraCount++;
      }
    });

    return extraCount;
  }

  calculateTotals() {
    let calories = 0;
    let protein = 0;
    let carbs = 0;
    let fats = 0;
    let extraPrice = 0;

    Object.entries(this.selectedIngredients).forEach(([id, quantity]) => {
      const ingredient = this.data.ingredients.find(ing => ing.id == id);
      const category = ingredient.categoria;
      const extraQuantity = this.getExtraQuantityForIngredient(parseInt(id), category);
      
      calories += ingredient.calorias * quantity;
      protein += ingredient.proteinas * quantity;
      carbs += ingredient.carbohidratos * quantity;
      fats += ingredient.grasas * quantity;
      
      // Only charge extra for ingredients over the limit
      extraPrice += ingredient.extraPrecio * extraQuantity;
    });

    return {
      calories: Math.round(calories),
      protein: Math.round(protein * 10) / 10,
      carbs: Math.round(carbs * 10) / 10,
      fats: Math.round(fats * 10) / 10,
      extraPrice,
      totalPrice: this.selectedBowlModel.basePrice + extraPrice
    };
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new BowlCalculator();
});
