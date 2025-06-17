import {
  Page,
  Card,
  IndexTable,
  Button,
  Modal,
  FormLayout,
  TextField,
  Select,
  ChoiceList,
  Frame,
  Toast,
  Spinner,
  Text,
  ButtonGroup,
  InlineStack,
  Badge,
} from '@shopify/polaris';
import { EditIcon, DeleteIcon } from '@shopify/polaris-icons';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useFetcher, useLoaderData, useRevalidator } from '@remix-run/react';
import { authenticate } from '../shopify.server';

// Import the new GraphQL utilities
import {
  GET_INGREDIENTS_METAOBJECTS_QUERY,
  GET_INGREDIENT_DEFINITION_QUERY,
  CREATE_INGREDIENT_METAOBJECT_MUTATION,
  UPDATE_INGREDIENT_METAOBJECT_MUTATION,
  DELETE_INGREDIENT_METAOBJECT_MUTATION,
} from '../utils/graphql';


// --- SERVER-SIDE LOADER ---
export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  const [ingredientsResponse, definitionResponse] = await Promise.all([
    admin.graphql(GET_INGREDIENTS_METAOBJECTS_QUERY),
    admin.graphql(GET_INGREDIENT_DEFINITION_QUERY),
  ]);

  const ingredientsData = await ingredientsResponse.json();
  const definitionData = await definitionResponse.json();

  const ingredients = ingredientsData.data.metaobjects.edges.map(({ node }) => ({
    id: node.id,
    nombre: node.nombre?.value,
    categoria: node.categoria?.value,
    alergenos: JSON.parse(node.alergenos?.value || '[]'),
    calorias: node.calorias?.value,
    carbohidratos: node.carbohidratos?.value,
    grasas: node.grasas?.value,
    proteinas: node.proteinas?.value,
    extraPrecio: JSON.parse(node.extra_precio?.value || '{}').amount,
  }));

  const definition = definitionData.data.metaobjectDefinitionByType;
  const getChoices = (key) => {
    const field = definition?.fieldDefinitions.find(f => f.key === key);
    const validation = field?.validations.find(v => v.name === 'choices');
    return validation ? JSON.parse(validation.value) : [];
  };

  const categories = getChoices('categoria');
  const allergens = getChoices('alergenos');

  return Response.json({ ingredients, categories, allergens });
}


// --- SERVER-SIDE ACTION ---
export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const payload = JSON.parse(formData.get('payload'));
  const { actionType, data } = payload;
  
  const shopCurrencyResponse = await admin.graphql(`query { shop { currencyCode } }`);
  const shopCurrencyData = await shopCurrencyResponse.json();
  const currencyCode = shopCurrencyData.data.shop.currencyCode;
  
  const buildFields = (d) => [
    { key: 'nombre', value: d.nombre },
    { key: 'categoria', value: d.categoria },
    { key: 'alergenos', value: JSON.stringify(d.alergenos) },
    { key: 'calorias', value: d.calorias },
    { key: 'carbohidratos', value: d.carbohidratos },
    { key: 'grasas', value: d.grasas },
    { key: 'proteinas', value: d.proteinas },
    { key: 'extra_precio', value: JSON.stringify({ amount: parseFloat(d.extraPrecio) || 0, currency_code: currencyCode }) },
  ];

  try {
    switch (actionType) {
      case 'CREATE': {
        const handle = data.nombre.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
        const metaobject = {
          type: "metaingredientes",
          fields: buildFields(data),
          handle: `${handle}-${Date.now()}`
        };
        const response = await admin.graphql(CREATE_INGREDIENT_METAOBJECT_MUTATION, { variables: { metaobject } });
        const responseData = await response.json();
        if (responseData.data?.metaobjectCreate?.userErrors.length > 0) {
          return Response.json({ errors: responseData.data.metaobjectCreate.userErrors }, { status: 422 });
        }
        return Response.json({ success: true, message: 'Ingrediente creado.' });
      }
      case 'UPDATE': {
        const metaobject = { fields: buildFields(data) };
        const response = await admin.graphql(UPDATE_INGREDIENT_METAOBJECT_MUTATION, { variables: { id: data.id, metaobject } });
        const responseData = await response.json();
        if (responseData.data?.metaobjectUpdate?.userErrors.length > 0) {
          return Response.json({ errors: responseData.data.metaobjectUpdate.userErrors }, { status: 422 });
        }
        return Response.json({ success: true, message: 'Ingrediente actualizado.' });
      }
      case 'DELETE': {
        const response = await admin.graphql(DELETE_INGREDIENT_METAOBJECT_MUTATION, { variables: { id: data.id } });
        const responseData = await response.json();
        if (responseData.data?.metaobjectDelete?.userErrors.length > 0) {
          return Response.json({ errors: responseData.data.metaobjectDelete.userErrors }, { status: 422 });
        }
        return Response.json({ success: true, message: 'Ingrediente eliminado.' });
      }
      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error("Action error:", error);
    return Response.json({ errors: [{ message: "An unexpected server error occurred." }] }, { status: 500 });
  }
}

// --- INITIAL FORM STATE ---
const INITIAL_FORM_STATE = { nombre: '', categoria: '', alergenos: [], calorias: '0', carbohidratos: '0', grasas: '0', proteinas: '0', extraPrecio: '0' };

// --- REACT COMPONENT ---
export default function IngredientsMetaobjectsPage() {
  const { ingredients, categories, allergens } = useLoaderData();
  const fetcher = useFetcher();
  const { revalidate } = useRevalidator();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [toast, setToast] = useState({ active: false, content: '' });

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [ingredientToDelete, setIngredientToDelete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const actionLoading = fetcher.state !== 'idle';

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      const { success, message, errors } = fetcher.data;
      if (success) {
        showToast(message);
        setIsModalOpen(false);
        setIsDeleteModalOpen(false);
        setDeletingId(null);
        revalidate();
      } else if (errors) {
        showToast(errors[0].message, true);
        setDeletingId(null);
      }
    }
  }, [fetcher.state, fetcher.data, revalidate]);

  const showToast = (content, error = false) => {
    setToast({ active: true, content, error });
  };

  const handleOpenModal = (ingredient = null) => {
    if (ingredient) {
      setIsEditing(true);
      setFormData(ingredient);
    } else {
      setIsEditing(false);
      setFormData(INITIAL_FORM_STATE);
    }
    setIsModalOpen(true);
  };
  
  const openDeleteModal = (ingredient) => {
    setIngredientToDelete(ingredient);
    setIsDeleteModalOpen(true);
  };

  const handleFormChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = () => {
    if (!formData.nombre || !formData.categoria) {
      showToast('Nombre y categoría son obligatorios', true);
      return;
    }
    const payload = { actionType: isEditing ? 'UPDATE' : 'CREATE', data: formData };
    const submitData = new FormData();
    submitData.append('payload', JSON.stringify(payload));
    fetcher.submit(submitData, { method: 'POST' });
  };

  const handleDelete = () => {
    if (!ingredientToDelete) return;
    setDeletingId(ingredientToDelete.id);
    const payload = { actionType: 'DELETE', data: { id: ingredientToDelete.id } };
    const submitData = new FormData();
    submitData.append('payload', JSON.stringify(payload));
    fetcher.submit(submitData, { method: 'POST' });
  };

  const resourceName = { singular: 'ingrediente', plural: 'ingredientes' };

  const tableRows = useMemo(() => ingredients.map((ing) => (
    <IndexTable.Row id={ing.id} key={ing.id}>
      <IndexTable.Cell><Text fontWeight="bold" as="span">{ing.nombre}</Text></IndexTable.Cell>
      <IndexTable.Cell>
        {/* FIX: Add a warning badge for ingredients with no category */}
        {ing.categoria ? (
          <Badge tone="info">{ing.categoria}</Badge>
        ) : (
          <Badge tone="warning">Falta categoría</Badge>
        )}
      </IndexTable.Cell>
      <IndexTable.Cell>{ing.calorias}</IndexTable.Cell>
      <IndexTable.Cell>{ing.carbohidratos}g</IndexTable.Cell>
      <IndexTable.Cell>{ing.grasas}g</IndexTable.Cell>
      <IndexTable.Cell>{ing.proteinas}g</IndexTable.Cell>
      <IndexTable.Cell>€{parseFloat(ing.extraPrecio || 0).toFixed(2)}</IndexTable.Cell>
      <IndexTable.Cell>
        {ing.alergenos.length > 0
          ? <InlineStack gap="100">{ing.alergenos.map(a => <Badge key={a} tone="info">{a}</Badge>)}</InlineStack>
          : <Text tone="subdued" as="span">-</Text>}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="300" blockAlign="center" wrap={false}>
          {deletingId === ing.id ? (
            <Spinner size="small" accessibilityLabel="Eliminando" />
          ) : (
            <ButtonGroup variant="segmented">
              <Button icon={EditIcon} onClick={() => handleOpenModal(ing)} accessibilityLabel="Editar" />
              <Button icon={DeleteIcon} onClick={() => openDeleteModal(ing)} accessibilityLabel="Eliminar" tone="critical" />
            </ButtonGroup>
          )}
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  )), [ingredients, deletingId]);

  return (
    <Frame>
      <Page
        title="Gestión de Ingredientes (Metaobjects)"
        primaryAction={{ content: 'Añadir Ingrediente', onAction: () => handleOpenModal() }}
      >
        <Card>
          <IndexTable
            resourceName={resourceName}
            itemCount={ingredients.length}
            selectable={false}
            headings={[
              { title: 'Nombre' }, { title: 'Categoría' }, { title: 'Calorías' }, { title: 'Carbs.' },
              { title: 'Grasas' }, { title: 'Proteínas' }, { title: 'Precio Extra' }, { title: 'Alérgenos' },
              { title: 'Acciones' }
            ]}
          >
            {tableRows}
          </IndexTable>
        </Card>
      </Page>

      {isModalOpen && (
        <Modal
          open={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={isEditing ? 'Editar Ingrediente' : 'Añadir Nuevo Ingrediente'}
          primaryAction={{ content: 'Guardar', onAction: handleSubmit, loading: actionLoading && !deletingId }}
          secondaryActions={[{ content: 'Cancelar', onAction: () => setIsModalOpen(false) }]}
        >
          <Modal.Section>
            {actionLoading ? <Spinner /> : (
              <FormLayout>
                <TextField label="Nombre" value={formData.nombre} onChange={v => handleFormChange('nombre', v)} requiredIndicator autoComplete='off' />
                <Select label="Categoría" options={[{label: 'Seleccionar', value: ''}, ...categories.map(c => ({label: c, value: c}))]} value={formData.categoria} onChange={v => handleFormChange('categoria', v)} requiredIndicator />
                <TextField label="Precio Extra" type="number" value={formData.extraPrecio} onChange={v => handleFormChange('extraPrecio', v)} prefix="€" autoComplete='off' step={.5} />
                <FormLayout.Group>
                  <TextField label="Calorías" type="number" value={formData.calorias} onChange={v => handleFormChange('calorias', v)} autoComplete='off' />
                  <TextField label="Proteínas" type="number" value={formData.proteinas} onChange={v => handleFormChange('proteinas', v)} autoComplete='off' />
                </FormLayout.Group>
                <FormLayout.Group>
                  <TextField label="Carbohidratos" type="number" value={formData.carbohidratos} onChange={v => handleFormChange('carbohidratos', v)} autoComplete='off' />
                  <TextField label="Grasas" type="number" value={formData.grasas} onChange={v => handleFormChange('grasas', v)} autoComplete='off' />
                </FormLayout.Group>
                <ChoiceList title="Alérgenos" choices={allergens.map(a => ({label: a, value: a}))} selected={formData.alergenos} onChange={v => handleFormChange('alergenos', v)} allowMultiple />
              </FormLayout>
            )}
          </Modal.Section>
        </Modal>
      )}
      
      <Modal
        open={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title={`¿Eliminar ${ingredientToDelete?.nombre}?`}
        primaryAction={{
          content: 'Eliminar',
          onAction: handleDelete,
          destructive: true,
          loading: !!deletingId,
        }}
        secondaryActions={[{ content: 'Cancelar', onAction: () => setIsDeleteModalOpen(false) }]}
      >
        <Modal.Section>
          <p>¿Estás seguro de que quieres eliminar el ingrediente <Text as="span" fontWeight="bold">{ingredientToDelete?.nombre}</Text>? Esta acción no se puede deshacer.</p>
        </Modal.Section>
      </Modal>

      {toast.active && <Toast content={toast.content} error={toast.error} onDismiss={() => setToast({active: false})} />}
    </Frame>
  );
}
