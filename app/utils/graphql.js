/**
 * =====================================================================================
 * UNIFIED GRAPHQL UTILITY FILE
 * =====================================================================================
 * This file contains all GraphQL queries and mutations for the entire application,
 * covering ingredients, configurations, sorting, and bowl models.
 */

// ==========================================================================================
// --- INGREDIENT METAOBJECTS (app/routes/app.ingredientes.jsx) ---
// ==========================================================================================

/**
 * @description Fetches all "Ingrediente" metaobjects with their relevant fields.
 * @used_in `app.ingredientes.jsx` loader to display the list of ingredients.
 */
export const GET_INGREDIENTS_METAOBJECTS_QUERY = `
  query getIngredientMetaobjects {
    metaobjects(type: "metaingredientes", first: 250) {
      edges {
        node {
          id
          handle
          nombre: field(key: "nombre") { value }
          categoria: field(key: "categoria") { value }
          alergenos: field(key: "alergenos") { value }
          calorias: field(key: "calorias") { value }
          carbohidratos: field(key: "carbohidratos") { value }
          grasas: field(key: "grasas") { value }
          proteinas: field(key: "proteinas") { value }
          extra_precio: field(key: "extra_precio") { value }
        }
      }
    }
  }
`;

/**
 * @description Creates a new "Ingrediente" metaobject.
 * @used_in `app.ingredientes.jsx` action to add a new ingredient.
 */
export const CREATE_INGREDIENT_METAOBJECT_MUTATION = `
  mutation createIngredient($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * @description Updates an existing "Ingrediente" metaobject.
 * @used_in `app.ingredientes.jsx` action to save changes to an ingredient.
 */
export const UPDATE_INGREDIENT_METAOBJECT_MUTATION = `
  mutation updateIngredient($id: ID!, $metaobject: MetaobjectUpdateInput!) {
    metaobjectUpdate(id: $id, metaobject: $metaobject) {
      metaobject {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * @description Deletes an "Ingrediente" metaobject.
 * @used_in `app.ingredientes.jsx` action to remove an ingredient.
 */
export const DELETE_INGREDIENT_METAOBJECT_MUTATION = `
  mutation deleteIngredient($id: ID!) {
    metaobjectDelete(id: $id) {
      deletedId
      userErrors {
        field
        message
      }
    }
  }
`;


// ==========================================================================================
// --- BOWL MODEL METAOBJECTS (app/routes/app.bowl-models.jsx) ---
// ==========================================================================================

/**
 * @description Fetches all "Bowl Model" metaobjects.
 * @used_in `app.bowl-models.jsx` loader to display the list of bowl models.
 */
export const GET_BOWL_MODELS_QUERY = `
  query getBowlModelMetaobjects {
    metaobjects(type: "bowl_model", first: 50) {
      edges {
        node {
          id
          handle
          name: field(key: "name") { value }
          description: field(key: "description") { value }
          base_price: field(key: "base_price") { value }
          category_limits: field(key: "category_limits") { value }
        }
      }
    }
  }
`;

/**
 * @description Creates a new "Bowl Model" metaobject.
 * @used_in `app.bowl-models.jsx` action to add a new bowl model.
 */
export const CREATE_BOWL_MODEL_MUTATION = `
  mutation metaobjectCreate($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * @description Updates an existing "Bowl Model" metaobject.
 * @used_in `app.bowl-models.jsx` action to save changes to a bowl model.
 */
export const UPDATE_BOWL_MODEL_MUTATION = `
  mutation metaobjectUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
    metaobjectUpdate(id: $id, metaobject: $metaobject) {
      metaobject {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * @description Deletes a "Bowl Model" metaobject.
 * @used_in `app.bowl-models.jsx` action to remove a bowl model.
 */
export const DELETE_BOWL_MODEL_MUTATION = `
  mutation metaobjectDelete($id: ID!) {
    metaobjectDelete(id: $id) {
      deletedId
      userErrors {
        field
        message
      }
    }
  }
`;

// ==========================================================================================
// --- METAOBJECT DEFINITIONS (app/routes/app.configurations.jsx) ---
// ==========================================================================================

/**
 * @description Fetches the definition for "Ingredientes" to get the preset choices for its fields.
 * @used_in `app.configurations.jsx` and `app.ingredientes.jsx` loaders.
 */
export const GET_INGREDIENT_DEFINITION_QUERY = `
  query getIngredientDefinition {
    metaobjectDefinitionByType(type: "metaingredientes") {
      id
      fieldDefinitions {
        key
        validations {
          name
          value
        }
      }
    }
  }
`;

/**
 * @description Performs a partial update on a metaobject definition, used to change preset choices.
 * @used_in `app.configurations.jsx` action to save new categories/allergens.
 */
export const PARTIAL_UPDATE_DEFINITION_MUTATION = `
  mutation metaobjectDefinitionUpdate($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
    metaobjectDefinitionUpdate(id: $id, definition: $definition) {
      metaobjectDefinition {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ==========================================================================================
// --- SHOP METAFIELDS (app/routes/app.orden.jsx) ---
// ==========================================================================================

/**
 * @description Fetches the shop-level metafields that store the sort order for categories and ingredients.
 * @used_in `app.orden.jsx` loader.
 */
export const GET_SORT_ORDER_QUERY = `
  query getSortOrders {
    shop {
      categoryOrder: metafield(namespace: "custom", key: "category_order") {
        value
      }
      ingredientOrder: metafield(namespace: "custom", key: "ingredient_order") {
        value
      }
    }
  }
`;

/**
 * @description Sets the value for the shop-level sort order metafields.
 * @used_in `app.orden.jsx` action to save the new drag-and-drop order.
 */
export const SET_SORT_ORDER_MUTATION = `
  mutation setSortOrders($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        key
        value
      }
      userErrors {
        field
        message
      }
    }
  }
`;
